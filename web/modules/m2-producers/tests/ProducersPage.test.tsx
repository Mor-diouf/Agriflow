import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProducersPage } from "../src";

// Extraits réels de l'API (seed 42)
const SUMMARY = {
  total: 100,
  deliverable_t: 1438.044595,
  tiers: [
    { tier: "prioritaire", count: 20, mean_score: 0.5912, deliverable_t: 575.6208 },
    { tier: "standard", count: 40, mean_score: 0.4605, deliverable_t: 545.2422 },
    { tier: "a_surveiller", count: 40, mean_score: 0.3223, deliverable_t: 317.1817 },
  ],
};

const P053 = {
  id: "P053", area_ha: 9.1, yield_t_per_ha: 11.4, reliability: 0.64, rejection_rate: 0.3,
  production_t: 103.7, deliverable_t: 66.4, distance_km: 20.1, score: 0.75, tier: "prioritaire",
};
const P034 = {
  id: "P034", area_ha: 6.2, yield_t_per_ha: 7.5, reliability: 0.91, rejection_rate: 0.047,
  production_t: 46.5, deliverable_t: 42.3, distance_km: 30.2, score: 0.69, tier: "prioritaire",
};

const CONFIG = {
  data_status: "simulated", zones: ["Bignona"], factory_capacity_t_per_day: 28.3,
  factory_capacity_t_per_week: 198.1, factory_capacity_t_per_year: 8500,
  score_weights: { TR: 0.33, d: 0.33, P: 0.33 }, priority_tiers: { prioritaire: 0.8 },
};

let requests: URL[] = [];
let failApi = false;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  requests = [];
  failApi = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      requests.push(url);
      if (failApi) return json({ detail: "indisponible" }, 503);
      if (url.pathname === "/v1/config") return json(CONFIG);
      if (url.pathname === "/v1/producers/summary") return json(SUMMARY);
      if (url.pathname === "/v1/producers") {
        const search = url.searchParams.get("search");
        const items = search === "ZZZ" ? [] : [P053, P034];
        return json({ total: items.length, items });
      }
      return json({ detail: "inconnu" }, 404);
    }),
  );
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProducersPage />
    </QueryClientProvider>,
  );
}

const lastListRequest = () => requests.filter((u) => u.pathname === "/v1/producers").at(-1)!;

describe("ProducersPage", () => {
  it("affiche les indicateurs et la table à partir de l'API", async () => {
    renderPage();

    const kpis = await screen.findByRole("group", { name: "Indicateurs clés" });
    await waitFor(() => expect(within(kpis).getByText("1 438,0")).toBeInTheDocument());
    expect(within(kpis).getByText("40,0 % du volume livrable")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: "Ouvrir la fiche de P053" })).toBeInTheDocument();
    expect(screen.getByText(/Données simulées/)).toBeInTheDocument();
    // Le taux de rejet de 30 % est signalé, celui de 4,7 % non
    expect(screen.getByTitle("Taux de rejet supérieur à 15 %")).toHaveTextContent("30,0 %");
    expect(screen.getByText("4,7 %")).not.toHaveAttribute("title");
  });

  it("filtre par niveau via l'API", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Prioritaire · 20" }));

    await waitFor(() => expect(lastListRequest().searchParams.get("tier")).toBe("prioritaire"));
    expect(screen.getByRole("button", { name: "Prioritaire · 20" })).toHaveAttribute("aria-pressed", "true");
  });

  it("trie par distance croissante puis inverse l'ordre", async () => {
    renderPage();
    const distance = await screen.findByRole("button", { name: /Distance usine/ });

    await userEvent.click(distance);
    await waitFor(() => expect(lastListRequest().searchParams.get("sort")).toBe("distance"));
    expect(lastListRequest().searchParams.get("order")).toBe("asc");
    expect(distance.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(distance);
    await waitFor(() => expect(lastListRequest().searchParams.get("order")).toBe("desc"));
  });

  it("recherche et affiche un état vide", async () => {
    renderPage();
    await userEvent.type(await screen.findByRole("searchbox", { name: "Rechercher un producteur" }), "ZZZ");

    expect(await screen.findByText(/Aucun producteur ne correspond/)).toBeInTheDocument();
    expect(lastListRequest().searchParams.get("search")).toBe("ZZZ");
  });

  it("ouvre la fiche et signale le rejet élevé", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Ouvrir la fiche de P053" }));

    const dialog = await screen.findByRole("dialog", { name: "P053" });
    expect(within(dialog).getByText(/Taux de rejet élevé/)).toBeInTheDocument();
    expect(within(dialog).getByText("66,4 t")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("affiche une erreur claire si l'API est indisponible", async () => {
    failApi = true;
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de joindre l'API SM10");
  });
});
