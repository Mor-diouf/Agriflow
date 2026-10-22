import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FieldCollectPage } from "../src";

const CONFIG = { data_status: "simulated", zones: ["Bignona", "Sédhiou"], forecast_seasons: [], forecast_horizons: [] };

type Put = { path: string; body: Record<string, unknown> };

let networkUp = true;
let serverProducers: Record<string, unknown>[] = [];
let serverHarvests: Record<string, unknown>[] = [];
let puts: Put[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Faux serveur : mêmes réponses que /v1/field, et un interrupteur de réseau. */
async function fakeServer(input: Request) {
  if (!networkUp) throw new TypeError("Failed to fetch");
  const url = new URL(input.url);
  if (input.method === "GET") {
    if (url.pathname === "/v1/config") return json(CONFIG);
    if (url.pathname === "/v1/field/producers") return json(serverProducers);
    if (url.pathname === "/v1/field/harvests") return json(serverHarvests);
    return json({ detail: "inconnu" }, 404);
  }
  const body = (await input.json()) as Record<string, unknown>;
  puts.push({ path: url.pathname, body });
  const id = url.pathname.split("/").pop()!;
  if (url.pathname.startsWith("/v1/field/producers/")) {
    const stored = { id, code: `AGR-${String(serverProducers.length + 1).padStart(4, "0")}`, ...body, harvest_count: 0, harvested_kg: 0, rejection_rate: null };
    serverProducers = [stored, ...serverProducers];
    return json(stored, 201);
  }
  if (!serverProducers.some((p) => p.id === body.producer_id)) return json({ detail: "Producteur inconnu" }, 409);
  const stored = { id, producer_code: "AGR-0001", season: 2026, week: 24, ...body };
  serverHarvests = [stored, ...serverHarvests];
  return json(stored, 201);
}

beforeEach(() => {
  window.localStorage.clear();
  networkUp = true;
  serverProducers = [];
  serverHarvests = [];
  puts = [];
  vi.stubGlobal("fetch", vi.fn(fakeServer));
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FieldCollectPage />
    </QueryClientProvider>,
  );
}

const syncBar = () => screen.getByRole("region", { name: "Envoi des saisies" });

async function registerProducer(user: ReturnType<typeof userEvent.setup>, { consent = true } = {}) {
  await user.click(screen.getByRole("button", { name: /^Producteurs/ }));
  await user.click(screen.getByRole("button", { name: "Recenser un producteur" }));
  const form = screen.getByRole("form", { name: "Recenser un producteur" });
  await user.type(within(form).getByLabelText("Nom du producteur"), "Awa Diatta");
  await user.type(within(form).getByLabelText("Village"), "Bambali");
  await user.selectOptions(within(form).getByLabelText("Zone"), "Sédhiou");
  if (consent) await user.click(within(form).getByRole("checkbox"));
  await user.click(within(form).getByRole("button", { name: "Enregistrer le producteur" }));
}

describe("FieldCollectPage", () => {
  it("recense un producteur hors réseau, puis l'envoie au retour du réseau", async () => {
    // Zones gardées lors d'une connexion précédente ; aujourd'hui, pas de réseau
    window.localStorage.setItem("agriflow.collecte.cache.zones", JSON.stringify(CONFIG.zones));
    networkUp = false;
    const user = userEvent.setup();
    renderPage();

    await registerProducer(user);
    expect(screen.getByRole("status")).toHaveTextContent("Awa Diatta est enregistré sur le téléphone");
    expect(await within(syncBar()).findByText("1 saisie en attente d'envoi.")).toBeInTheDocument();
    expect(within(syncBar()).getByText("Hors réseau")).toBeInTheDocument();
    expect(screen.getByText("En attente d'envoi")).toBeInTheDocument();

    networkUp = true;
    await user.click(screen.getByRole("button", { name: "Envoyer maintenant" }));
    expect(await within(syncBar()).findByText(/Toutes les saisies sont envoyées/)).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ full_name: "Awa Diatta", zone: "Sédhiou", consent_given: true });
    expect(await screen.findByText("AGR-0001")).toBeInTheDocument();
  });

  it("refuse un producteur sans son accord", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/Toutes les saisies sont envoyées/);

    await registerProducer(user, { consent: false });
    expect(screen.getByText("Le producteur doit avoir donné son accord.")).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it("enregistre une collecte en contrôlant le rejet", async () => {
    serverProducers = [
      { id: "11111111-1111-4111-8111-111111111111", code: "AGR-0001", full_name: "Awa Diatta", village: "Bambali", zone: "Sédhiou",
        consent_given: true, harvest_count: 0, harvested_kg: 0, rejection_rate: null },
    ];
    const user = userEvent.setup();
    renderPage();
    const form = screen.getByRole("form", { name: "Nouvelle collecte" });
    await within(form).findByRole("option", { name: "AGR-0001 · Awa Diatta (Bambali)" });

    await user.selectOptions(within(form).getByLabelText("Producteur"), "AGR-0001 · Awa Diatta (Bambali)");
    await user.type(within(form).getByLabelText("Quantité collectée (kg)"), "800");
    await user.clear(within(form).getByLabelText("Dont rejetée (kg)"));
    await user.type(within(form).getByLabelText("Dont rejetée (kg)"), "900");
    await user.click(within(form).getByRole("button", { name: "Enregistrer la collecte" }));
    expect(within(form).getByText("Le rejet dépasse la quantité collectée.")).toBeInTheDocument();

    await user.clear(within(form).getByLabelText("Dont rejetée (kg)"));
    await user.type(within(form).getByLabelText("Dont rejetée (kg)"), "40,5");
    await user.click(within(form).getByRole("button", { name: "Enregistrer la collecte" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      path: expect.stringMatching(/^\/v1\/field\/harvests\//),
      body: { producer_id: "11111111-1111-4111-8111-111111111111", quantity_kg: 800, rejected_kg: 40.5 },
    });
    expect(await within(syncBar()).findByText(/Toutes les saisies sont envoyées/)).toBeInTheDocument();
  });

  it("saisit la collecte d'un producteur pas encore envoyé, et envoie le producteur d'abord", async () => {
    window.localStorage.setItem("agriflow.collecte.cache.zones", JSON.stringify(CONFIG.zones));
    networkUp = false;
    const user = userEvent.setup();
    renderPage();
    await registerProducer(user);

    await user.click(screen.getByRole("button", { name: "Nouvelle collecte" }));
    const form = screen.getByRole("form", { name: "Nouvelle collecte" });
    await user.selectOptions(within(form).getByLabelText("Producteur"), "Nouveau · Awa Diatta (Bambali)");
    await user.type(within(form).getByLabelText("Quantité collectée (kg)"), "1200");
    await user.click(within(form).getByRole("button", { name: "Enregistrer la collecte" }));
    expect(await within(syncBar()).findByText("2 saisies en attente d'envoi.")).toBeInTheDocument();

    networkUp = true;
    await user.click(screen.getByRole("button", { name: "Envoyer maintenant" }));
    await within(syncBar()).findByText(/Toutes les saisies sont envoyées/);
    expect(puts.map((p) => p.path.split("/")[3])).toEqual(["producers", "harvests"]);
    // Les saisies envoyées ne restent pas dans la mémoire du téléphone
    expect(JSON.parse(window.localStorage.getItem("agriflow.collecte.envois.v1")!)).toEqual([]);
  });
});
