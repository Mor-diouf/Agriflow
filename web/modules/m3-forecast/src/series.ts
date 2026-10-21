import type { ForecastPoint } from "@agriflow/api-client";

/** Une semaine de la saison pour le périmètre affiché : une zone, ou la somme des zones. */
export type WeekForecast = {
  week: number;
  actual_t: number;
  central_t: number;
  prudent_t: number;
  stress_t: number;
};

/**
 * Série hebdomadaire d'une zone, ou de toutes (zone = null) en additionnant les zones, comme la
 * Charge usine (M4). Additionner des quantiles revient à supposer que les zones varient ensemble :
 * le total prudent ou stress est donc un peu plus large qu'un vrai quantile de la récolte totale.
 */
export function weeklySeries(points: ForecastPoint[], zone: string | null): WeekForecast[] {
  const byWeek = new Map<number, WeekForecast>();
  for (const p of points) {
    if (zone !== null && p.zone !== zone) continue;
    const w = byWeek.get(p.week) ?? { week: p.week, actual_t: 0, central_t: 0, prudent_t: 0, stress_t: 0 };
    w.actual_t += p.actual_t;
    w.central_t += p.central_t;
    w.prudent_t += p.prudent_t;
    w.stress_t += p.stress_t;
    byWeek.set(p.week, w);
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

/** Semaines où une récolte est observée ou prévue, avec une semaine de marge de chaque côté. */
export function seasonWindow(weeks: WeekForecast[]): WeekForecast[] {
  const active = weeks.flatMap((w, i) => (w.actual_t > 0 || w.central_t > 0 || w.stress_t > 0 ? [i] : []));
  if (active.length === 0) return [];
  return weeks.slice(Math.max(0, active[0] - 1), active[active.length - 1] + 2);
}

export type SeasonStats = {
  forecast_t: number;
  actual_t: number;
  /** (prévu − observé) / observé : même convention que le biais, positif = surestimation */
  gap: number;
  /** Semaines de récolte (observé > 0) : l'erreur et la couverture sont mesurées sur elles seules */
  harvestWeeks: number;
  mae_t: number;
  /** Erreur absolue cumulée rapportée à la récolte observée (WAPE) */
  wape: number;
  /** Part des semaines de récolte où l'observé n'a pas dépassé le niveau */
  prudentCoverage: number;
  stressCoverage: number;
  /** Semaine du pic de la prévision centrale, et semaine du pic observé */
  peak: WeekForecast;
  actualPeak: WeekForecast;
};

export function seasonStats(weeks: WeekForecast[]): SeasonStats | null {
  const harvest = weeks.filter((w) => w.actual_t > 0);
  if (harvest.length === 0) return null;

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const actual = sum(weeks.map((w) => w.actual_t));
  const forecast = sum(weeks.map((w) => w.central_t));
  const absError = sum(harvest.map((w) => Math.abs(w.central_t - w.actual_t)));
  const share = (covered: (w: WeekForecast) => boolean) => harvest.filter(covered).length / harvest.length;
  const peakOf = (key: "central_t" | "actual_t") => weeks.reduce((best, w) => (w[key] > best[key] ? w : best));

  return {
    forecast_t: forecast,
    actual_t: actual,
    gap: (forecast - actual) / actual,
    harvestWeeks: harvest.length,
    mae_t: absError / harvest.length,
    wape: absError / actual,
    prudentCoverage: share((w) => w.actual_t <= w.prudent_t),
    stressCoverage: share((w) => w.actual_t <= w.stress_t),
    peak: peakOf("central_t"),
    actualPeak: peakOf("actual_t"),
  };
}
