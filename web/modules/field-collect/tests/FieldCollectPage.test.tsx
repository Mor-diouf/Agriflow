import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FieldCollectPage } from "../src";

const CONFIG = { data_status: "simulated", zones: ["Bignona", "Sédhiou"], forecast_seasons: [], forecast_horizons: [] };

type Put = { path: string; body: Record<string, unknown> };

const AGENT = { id: "a1", login: "osagna", full_name: "Ousmane Sagna" };
const PIN = "482915";
const SESSION_KEY = "agriflow.collecte.session.v1";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let networkUp = true;
// Jeton que le serveur accepte ; null : aucune session valide (expirée ou fermée)
let validToken: string | null = "jeton-1";
let logins = 0;
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
  if (url.pathname === "/v1/auth/login") {
    const body = (await input.json()) as { login: string; pin: string };
    if (body.login !== AGENT.login || body.pin !== PIN) return json({ detail: "Identifiant ou code incorrect" }, 401);
    validToken = `jeton-${++logins + 1}`;
    return json({ token: validToken, expires_at: inDays(30), agent: AGENT });
  }
  if (url.pathname === "/v1/auth/logout") return new Response(null, { status: 204 });
  if (url.pathname.startsWith("/v1/field/") && input.headers.get("Authorization") !== `Bearer ${validToken}`) {
    return json({ detail: "Session expirée : reconnectez-vous" }, 401);
  }
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

const signedIn = (token = "jeton-1", expiresAt = inDays(30)) =>
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expires_at: expiresAt, agent: AGENT }));

beforeEach(() => {
  window.localStorage.clear();
  signedIn();
  networkUp = true;
  validToken = "jeton-1";
  logins = 0;
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

describe("FieldCollectPage — comptes des agents", () => {
  const loginForm = () => screen.getByRole("form", { name: "Connexion de l'agent" });

  async function signIn(user: ReturnType<typeof userEvent.setup>, pin = PIN) {
    await user.clear(within(loginForm()).getByLabelText("Identifiant"));
    await user.type(within(loginForm()).getByLabelText("Identifiant"), "osagna");
    await user.type(within(loginForm()).getByLabelText("Code personnel"), pin);
    await user.click(within(loginForm()).getByRole("button", { name: "Se connecter" }));
  }

  it("demande la connexion avant toute saisie, puis envoie le jeton", async () => {
    window.localStorage.removeItem(SESSION_KEY);
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole("form", { name: "Nouvelle collecte" })).not.toBeInTheDocument();

    await signIn(user, "111111");
    expect(await within(loginForm()).findByRole("alert")).toHaveTextContent("Identifiant ou code incorrect");
    expect(within(loginForm()).getByLabelText("Code personnel")).toHaveValue("");

    await signIn(user);
    expect(await screen.findByRole("form", { name: "Nouvelle collecte" })).toBeInTheDocument();
    expect(screen.getByText("Ousmane Sagna")).toBeInTheDocument();
    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls.map(([r]) => r as Request);
      const fieldCall = calls.find((r) => new URL(r.url).pathname === "/v1/field/producers");
      expect(fieldCall?.headers.get("Authorization")).toBe("Bearer jeton-2");
    });
  });

  it("garde les saisies quand la session expire, et les envoie après la reconnexion", async () => {
    window.localStorage.setItem("agriflow.collecte.cache.zones", JSON.stringify(CONFIG.zones));
    validToken = null; // le serveur a fermé la session
    const user = userEvent.setup();
    renderPage();

    expect(await within(syncBar()).findByText("Connexion expirée")).toBeInTheDocument();
    // La saisie reste possible et la fiche est gardée sur le téléphone
    await registerProducer(user);
    expect(within(syncBar()).getByText(/1 saisie en attente d'envoi\. Reconnectez-vous/)).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    await user.click(within(syncBar()).getByRole("button", { name: "Se reconnecter" }));
    // Même agent : les saisies en attente lui restent attribuées
    expect(within(loginForm()).getByLabelText("Identifiant")).toHaveValue("osagna");
    expect(within(loginForm()).getByLabelText("Identifiant")).toHaveAttribute("readonly");
    await user.type(within(loginForm()).getByLabelText("Code personnel"), PIN);
    await user.click(within(loginForm()).getByRole("button", { name: "Se connecter" }));

    expect(await within(syncBar()).findByText(/Toutes les saisies sont envoyées/)).toBeInTheDocument();
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toMatchObject({ full_name: "Awa Diatta" });
  });

  it("une session arrivée à échéance sur le téléphone met l'envoi en pause", async () => {
    signedIn("jeton-1", inDays(-1));
    renderPage();
    expect(await within(syncBar()).findByText("Connexion expirée")).toBeInTheDocument();
    expect(within(syncBar()).getByRole("button", { name: "Se reconnecter" })).toBeInTheDocument();
  });

  it("refuse la déconnexion tant que des saisies attendent, et efface les données personnelles ensuite", async () => {
    window.localStorage.setItem("agriflow.collecte.cache.zones", JSON.stringify(CONFIG.zones));
    serverProducers = [
      { id: "11111111-1111-4111-8111-111111111111", code: "AGR-0001", full_name: "Awa Diatta", village: "Bambali", zone: "Sédhiou",
        consent_given: true, harvest_count: 0, harvested_kg: 0, rejection_rate: null },
    ];
    networkUp = false;
    const user = userEvent.setup();
    renderPage();
    await registerProducer(user);
    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(screen.getByRole("status")).toHaveTextContent("Envoyez d'abord votre saisie en attente");
    expect(window.localStorage.getItem(SESSION_KEY)).not.toBeNull();

    networkUp = true;
    await user.click(screen.getByRole("button", { name: "Envoyer maintenant" }));
    await within(syncBar()).findByText(/Toutes les saisies sont envoyées/);
    await waitFor(() => expect(window.localStorage.getItem("agriflow.collecte.cache.producteurs")).not.toBeNull());

    await user.click(screen.getByRole("button", { name: "Se déconnecter" }));
    expect(screen.getByRole("form", { name: "Connexion de l'agent" })).toBeInTheDocument();
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem("agriflow.collecte.cache.producteurs")).toBeNull();
    expect(screen.queryByText("Awa Diatta")).not.toBeInTheDocument();
  });
});
