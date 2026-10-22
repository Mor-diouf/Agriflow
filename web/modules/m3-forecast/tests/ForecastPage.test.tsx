import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForecastPage } from "../src";

const MINUS = "−";

const CONFIG = {
  data_status: "simulated", zones: ["Bignona", "Kolda"], forecast_seasons: [2024, 2025], forecast_horizons: [1, 2, 3],
  factory_capacity_t_per_day: 28.3, factory_capacity_t_per_week: 198.1, factory_capacity_t_per_year: 8500,
  score_weights: {}, priority_tiers: {},
};

// Récolte observée et prévision centrale (t) des semaines 20 à 24 ; prudent et stress = centrale + marge de la zone
const SEASONS: Record<string, Record<string, { actual: number[]; central: number[] }>> = {
  2024: {
    Bignona: { actual: [8, 20, 40, 20, 8], central: [10, 22, 38, 24, 10] },
    Kolda: { actual: [4, 10, 20, 10, 4], central: [5, 11, 19, 12, 5] },
  },
  2025: {
    Bignona: { actual: [10, 30, 50, 30, 10], central: [12, 25, 45, 35, 13] },
    Kolda: { actual: [5, 15, 40, 15, 5], central: [6, 14, 20, 18, 9] },
  },
};
const MARGINS: Record<string, { prudent: number; stress: number }> = {
  Bignona: { prudent: 5, stress: 10 },
  Kolda: { prudent: 3, stress: 6 },
};

/** Reproduit /v1/forecast : 52 semaines par zone et par saison. */
function forecast(year: string | null) {
  return Object.entries(SEASONS)
    .filter(([y]) => !year || y === year)
    .flatMap(([y, zones]) =>
      Object.entries(zones).flatMap(([zone, { actual, central }]) =>
        Array.from({ length: 52 }, (_, i) => {
          const week = i + 1;
          const c = central[week - 20] ?? 0;
          return {
            year: Number(y), zone, week, actual_t: actual[week - 20] ?? 0, central_t: c,
            prudent_t: c ? c + MARGINS[zone].prudent : 0, stress_t: c ? c + MARGINS[zone].stress : 0,
          };
        }),
      ),
    );
}

const metrics = (weeks: number, mae: number, rmse: number, bias: number, coverage_pct: number) => ({
  weeks, mae, rmse, bias, coverage_pct,
});

const model = (horizon: number, name: string, level: string | null, all: ReturnType<typeof metrics>, harvest: ReturnType<typeof metrics>) => ({
  horizon, model: name, level, all_weeks: all, harvest_weeks: harvest,
});

// Erreur de la prévision centrale sur les semaines de récolte : sous la climatologie (7,42 t) à 1 et 2 semaines seulement
const CENTRAL_MAE: Record<number, number> = { 1: 5.31, 2: 6.12, 3: 7.6 };

// Ordres de grandeur du benchmark Phase J (arrondis)
const BENCHMARK = [1, 2, 3].flatMap((h) => [
  model(h, "Persistence", null, metrics(1040, 3.75, 7.42, 0, 73.5), metrics(541, 7.19 + 4 * (h - 1), 10.29, -0.02, 49.0)),
  model(h, "Climatologie", null, metrics(1040, 3.9, 6.1, 0.1, 70.0), metrics(541, 7.42, 9.8, 0.2, 52.0)),
  model(h, "Hurdle-SARIMAX(1,0,0)+Exog", null, metrics(1040, 2.77, 5.55, 0.39, 81.1), metrics(541, 5.44, 7.7, 0.74, 63.6)),
  model(h, "Combinaison SARIMAX + climatologie", "central", metrics(1040, 2.7, 5.4, 0.3, 80.0), metrics(541, CENTRAL_MAE[h], 7.5, 0.5, 60.0)),
  model(h, "Hurdle-Quantile(0.75) brut", null, metrics(1040, 3.3, 6.4, 1.5, 87.0), metrics(541, 6.62, 9.0, 3.0, 75.8)),
  model(h, "Hurdle-Quantile(0.90) brut", null, metrics(1040, 5.7, 10.1, 5.0, 93.0), metrics(541, 10.95, 13.9, 9.5, 87.6)),
  model(h, "Hurdle-Quantile(0.75) recalibré", "prudent", metrics(1040, 3.33, 6.46, 1.57, 87.5), metrics(541, 6.39, 8.96, 3.02, 76.0)),
  model(h, "Hurdle-Quantile(0.90) recalibré", "stress", metrics(1040, 5.69, 10.05, 5.0, 93.1), metrics(541, 10.89, 13.91, 9.56, 86.7)),
]);

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
      if (url.pathname === "/v1/forecast") return json(forecast(url.searchParams.get("year")));
      if (url.pathname === "/v1/forecast/benchmark") return json(BENCHMARK);
      return json({ detail: "inconnu" }, 404);
    }),
  );
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ForecastPage />
    </QueryClientProvider>,
  );
}

const forecastRequests = () => requests.filter((u) => u.pathname === "/v1/forecast");
const verdict = () => screen.getByText(/la prévision centrale annonçait/);

describe("ForecastPage", () => {
  it("ouvre sur la saison la plus récente, toutes zones confondues", async () => {
    renderPage();

    expect(await screen.findByText(/la prévision centrale annonçait/)).toHaveTextContent(
      `En 2025, sur l'ensemble des zones, la prévision centrale annonçait 197 t ; 210 t ont été récoltées (écart ${MINUS}6,2 %).`,
    );
    expect(forecastRequests().at(-1)!.searchParams.get("year")).toBe("2025");
    expect(forecastRequests().at(-1)!.searchParams.get("horizon")).toBe("1");

    const kpis = screen.getByRole("group", { name: "Indicateurs de la saison" });
    expect(within(kpis).getByText(`Observée : 210 t · écart ${MINUS}6,2 %`)).toBeInTheDocument();
    expect(within(kpis).getByText("Semaine 22 · pic observé en semaine 22 (90 t)")).toBeInTheDocument();
    // Erreur sur les seules semaines de récolte : 49 t d'écarts cumulés pour 210 t récoltées
    expect(within(kpis).getByText("23 % de la récolte · 5 semaines de récolte")).toBeInTheDocument();
    expect(within(kpis).getByText("Cible 75 % · stress non dépassé : 80 % (cible 90 %)")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: /pic prévu de 65\st en semaine 22/ })).toBeInTheDocument();
    expect(screen.getByText(/Données simulées/)).toBeInTheDocument();
  });

  it("filtre une zone depuis les filtres ou depuis le tableau des zones, sans nouvel appel", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/la prévision centrale annonçait/);

    await user.click(screen.getByRole("button", { name: "Kolda" }));
    expect(verdict()).toHaveTextContent("dans la zone de Kolda, la prévision centrale annonçait 67 t ; 80 t ont été récoltées");
    expect(screen.getByRole("heading", { name: "Récolte hebdomadaire · Kolda · 2025" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Afficher Bignona" }));
    expect(verdict()).toHaveTextContent("dans la zone de Bignona, la prévision centrale annonçait 130 t ; 130 t ont été récoltées (écart 0,0 %)");
    expect(screen.getByRole("button", { name: "Afficher Bignona" }).closest("tr")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Bignona" })).toHaveAttribute("aria-pressed", "true");

    expect(forecastRequests()).toHaveLength(1);
  });

  it("change de saison", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/la prévision centrale annonçait/);

    await user.click(screen.getByRole("button", { name: "2024" }));
    await waitFor(() =>
      expect(verdict()).toHaveTextContent(
        "En 2024, sur l'ensemble des zones, la prévision centrale annonçait 156 t ; 144 t ont été récoltées (écart +8,3 %).",
      ),
    );
    expect(forecastRequests().at(-1)!.searchParams.get("year")).toBe("2024");
  });

  it("propose une vue tableau qui signale les semaines au-delà des niveaux", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/la prévision centrale annonçait/);

    await user.click(screen.getByRole("button", { name: "Tableau" }));
    const table = screen.getByRole("table", { name: /semaine par semaine/ });
    const rows = within(table).getAllByRole("row");
    // en-tête + semaines 19 à 25 (une semaine de marge de chaque côté de la récolte)
    expect(rows).toHaveLength(8);

    const s22 = within(table).getByText("S22").closest("tr")!;
    expect(within(s22).getByText(`${MINUS}25,0 t`)).toBeInTheDocument();
    expect(within(s22).getByText("Stress dépassé")).toBeInTheDocument();
    expect(within(table).getAllByText("Stress dépassé")).toHaveLength(1);
  });

  it("parcourt le graphique au clavier et annonce chaque semaine", async () => {
    renderPage();
    const chart = await screen.findByRole("group", { name: /Flèches gauche et droite/ });

    // Au focus : la semaine du pic prévu
    fireEvent.focus(chart);
    expect(within(chart).getByRole("status")).toHaveTextContent(
      "Semaine 22 : récolte observée 90,0 t, prévision centrale 65,0 t, prudent 73,0 t, stress 81,0 t.",
    );
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(within(chart).getByRole("status")).toHaveTextContent(/^Semaine 23 :/);
    fireEvent.keyDown(chart, { key: "Home" });
    expect(within(chart).getByRole("status")).toHaveTextContent(/^Semaine 19 :/);
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(within(chart).getByRole("status")).toHaveTextContent("");
  });

  it("juge les modèles sur les semaines de récolte : gain sur la persistance et calibration", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/de moins que la persistance/)).toHaveTextContent(
      "erreur moyenne de 5,3 t par zone et par semaine de récolte, soit 26 % de moins que la persistance (7,2 t) " +
        "et 28 % de moins que la climatologie (7,4 t)",
    );

    const stress = screen.getByText(/pour 10 % attendus/);
    expect(stress).toHaveTextContent(
      "Niveau stress (quantile 90 %) : la récolte l'a dépassé 13 % des semaines de récolte, pour 10 % attendus. Il sous-estime les plus fortes semaines.",
    );
    expect(within(stress.closest("li")!).getByText("Un peu juste")).toBeInTheDocument();
    const prudent = screen.getByText(/pour 25 % attendus/);
    expect(prudent).toHaveTextContent("la récolte l'a dépassé 24 % des semaines de récolte");
    expect(within(prudent.closest("li")!).getByText("Calibré")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toutes les semaines" }));
    expect(screen.getByText(/comptent ici comme des prévisions parfaites/)).toBeInTheDocument();
    expect(screen.queryByText("Un peu juste")).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: /sur toutes les semaines/ });
    const central = within(table).getByText("Hurdle-SARIMAX(1,0,0)+Exog").closest("tr")!;
    expect(within(central).getByText("2,77 t")).toBeInTheDocument();
    expect(within(table).getByText("Persistance").closest("tr")).toHaveTextContent("Dernière récolte connue");
    expect(within(table).getByText("Hurdle-Quantile(0.90) brut").closest("tr")).toHaveTextContent("Avant recalibrage");
  });

  it("montre jusqu'où l'anticipation reste utile et change d'horizon partout", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/fait mieux que la climatologie/)).toHaveTextContent(
      "Jusqu'à 2 semaines d'anticipation, la prévision centrale fait mieux que la climatologie, " +
        "la moyenne des saisons passées (7,4 t) : 28 % d'erreur en moins à 1 semaine, 18 % à 2 semaines. " +
        "Au-delà, autant se fier à la saison moyenne.",
    );
    expect(screen.getByText("Utile jusqu'à 2 semaines")).toBeInTheDocument();

    // Depuis le tableau des horizons : prévisions, sous-titre et détail suivent
    await user.click(screen.getByRole("button", { name: "Afficher les prévisions à 3 semaines" }));
    await waitFor(() => expect(forecastRequests().at(-1)!.searchParams.get("horizon")).toBe("3"));
    expect(screen.getByText(/Prévision à 3 semaines, hors échantillon/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Détail des modèles · à 3 semaines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afficher les prévisions à 3 semaines" }).closest("tr")).toHaveAttribute(
      "aria-current",
      "true",
    );

    // Depuis le curseur des filtres
    fireEvent.change(screen.getByLabelText("Semaines d'anticipation de la prévision"), { target: { value: "2" } });
    await waitFor(() => expect(forecastRequests().at(-1)!.searchParams.get("horizon")).toBe("2"));
    expect(screen.getByRole("heading", { name: "Détail des modèles · à 2 semaines" })).toBeInTheDocument();
  });

  it("affiche un état d'erreur si l'API est injoignable", async () => {
    failApi = true;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de joindre l'API SM10");
  });
});
