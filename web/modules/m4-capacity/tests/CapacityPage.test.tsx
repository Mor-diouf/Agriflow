import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CapacityPage } from "../src";
import { activeWeeks } from "../src/LoadChart";

const CONFIG = {
  data_status: "simulated", zones: ["Bignona"], factory_capacity_t_per_day: 28.3,
  factory_capacity_t_per_week: 198.1, factory_capacity_t_per_year: 8500,
  score_weights: {}, priority_tiers: {},
};

// Flux prévus (t) des semaines 20 à 24, inspirés de la saison 2025 réelle
const INFLOW: Record<number, number[]> = { 2024: [60, 150, 180, 170, 90], 2025: [75, 230, 329, 280, 120] };
const LEVEL_FACTOR: Record<string, number> = { central: 1, prudent: 1.15, stress: 1.3 };

/** Reproduit core/m4_scenarios/capacity.py sur un petit jeu de semaines. */
function scenario(params: URLSearchParams) {
  const level = params.get("level") ?? "central";
  const vf = Number(params.get("volume_factor") ?? 1);
  const cf = Number(params.get("capacity_factor") ?? 1);
  const year = params.get("year");
  const capacity = 198.1 * cf;
  const weeks = Object.entries(INFLOW)
    .filter(([y]) => !year || y === year)
    .flatMap(([y, flows]) =>
      Array.from({ length: 52 }, (_, i) => {
        const week = i + 1;
        const inflow = (flows[week - 20] ?? 0) * vf * LEVEL_FACTOR[level];
        return {
          year: Number(y), week, inflow_t: inflow, actual_t: (flows[week - 20] ?? 0) * 0.95,
          capacity_t: capacity, saturation: inflow / capacity, excess_t: Math.max(0, inflow - capacity),
        };
      }),
    );
  const active = weeks.filter((w) => w.inflow_t > 0);
  const peak = weeks.reduce((a, b) => (b.saturation > a.saturation ? b : a));
  return {
    level, volume_factor: vf, capacity_factor: cf, weeks,
    summary: {
      weeks: weeks.length, active_weeks: active.length,
      weeks_over_capacity: weeks.filter((w) => w.saturation > 1).length,
      mean_active_saturation: active.reduce((s, w) => s + w.saturation, 0) / active.length,
      peak_saturation: peak.saturation, peak_year: peak.year, peak_week: peak.week,
      total_excess_t: weeks.reduce((s, w) => s + w.excess_t, 0),
    },
  };
}

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
      if (url.pathname === "/v1/scenarios/capacity") return json(scenario(url.searchParams));
      return json({ detail: "inconnu" }, 404);
    }),
  );
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CapacityPage />
    </QueryClientProvider>,
  );
}

const lastScenarioRequest = () => [...requests].reverse().find((u) => u.pathname === "/v1/scenarios/capacity")!;

describe("CapacityPage", () => {
  it("ouvre sur la saison la plus récente avec son verdict et ses indicateurs", async () => {
    renderPage();

    expect(await screen.findByText(/l'usine dépasse sa capacité/)).toHaveTextContent("En 2025");
    expect(screen.getByText("3 semaines sur 5")).toBeInTheDocument();
    expect(lastScenarioRequest().searchParams.get("year")).toBe("2025");

    const kpis = screen.getByRole("group", { name: "Indicateurs de la saison" });
    expect(within(kpis).getByText("Toutes saisons : 3 / 10")).toBeInTheDocument();
    expect(within(kpis).getByText("Semaine 22 · 329,0 t prévues")).toBeInTheDocument();
    expect(screen.getByText(/Données simulées/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /pic à 166 %/ })).toBeInTheDocument();
  });

  it("teste l'hypothèse d'une usine saisonnière (D1) : la saturation disparaît", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/l'usine dépasse sa capacité/);

    await user.click(screen.getByRole("button", { name: /Saisonnière/ }));

    expect(await screen.findByText(/l'usine absorbe tout le flux prévu/)).toBeInTheDocument();
    expect(Number(lastScenarioRequest().searchParams.get("capacity_factor"))).toBeCloseTo(300 / 90);
    expect(screen.getByText("94,3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revenir au scénario de référence" }));
    expect(await screen.findByText(/l'usine dépasse sa capacité/)).toBeInTheDocument();
  });

  it("transmet le niveau de prévision et le volume récolté à l'API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/l'usine dépasse sa capacité/);

    await user.click(screen.getByRole("button", { name: "Stress" }));
    await waitFor(() => expect(lastScenarioRequest().searchParams.get("level")).toBe("stress"));
    expect(screen.getByText(/Quantile 90 %/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Variation du volume récolté"), { target: { value: "80" } });
    expect(screen.getByText("−20 %")).toBeInTheDocument();
    await waitFor(() => expect(lastScenarioRequest().searchParams.get("volume_factor")).toBe("0.8"));
  });

  it("change de saison et propose une vue tableau des semaines", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/l'usine dépasse sa capacité/);

    await user.click(screen.getByRole("button", { name: "Saison 2024" }));
    expect(await screen.findByText(/En 2024, l'usine absorbe/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Saison 2025" }));
    await user.click(screen.getByRole("button", { name: "Tableau" }));
    const rows = within(await screen.findByRole("table")).getAllByRole("row");
    // en-tête + semaines 19 à 25 (une semaine de marge de chaque côté)
    expect(rows).toHaveLength(8);
    expect(within(rows[4]).getByText("166 %")).toHaveClass("af-badge--danger");
  });

  it("ne dessine que la saison choisie, y compris au premier chargement", async () => {
    renderPage();
    await screen.findByText(/l'usine dépasse sa capacité/);
    // Semaines 19 à 25 affichées, flux observé sur les semaines 20 à 24 : 5 points, pas un de plus
    expect(document.querySelectorAll(".af-chart__dot")).toHaveLength(5);
  });

  it("affiche un état d'erreur si l'API est injoignable", async () => {
    failApi = true;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de joindre l'API SM10");
  });
});

describe("activeWeeks", () => {
  it("garde les semaines actives avec une semaine de marge", () => {
    const week = (w: number, inflow: number) => ({
      year: 2025, week: w, inflow_t: inflow, actual_t: 0, capacity_t: 198.1, saturation: 0, excess_t: 0,
    });
    const weeks = [week(1, 0), week(2, 0), week(3, 5), week(4, 8), week(5, 0), week(6, 0)];
    expect(activeWeeks(weeks).map((w) => w.week)).toEqual([2, 3, 4, 5]);
    expect(activeWeeks([week(1, 0)])).toEqual([]);
  });
});
