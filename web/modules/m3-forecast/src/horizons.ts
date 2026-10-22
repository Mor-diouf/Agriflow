import type { ModelBenchmark } from "@agriflow/api-client";

import { BASELINE_MODEL, CLIMATOLOGY_MODEL } from "./levels";

/** Fiabilité à un horizon, sur les semaines de récolte : erreur moyenne (t) et couverture (%). */
export type HorizonSummary = {
  horizon: number;
  centralMae: number;
  persistenceMae?: number;
  climatologyMae?: number;
  prudentCoveragePct?: number;
  stressCoveragePct?: number;
};

export function horizonSummaries(models: ModelBenchmark[]): HorizonSummary[] {
  const horizons = [...new Set(models.map((m) => m.horizon))].sort((a, b) => a - b);
  return horizons.flatMap((horizon) => {
    const at = models.filter((m) => m.horizon === horizon);
    const central = at.find((m) => m.level === "central");
    if (!central) return [];
    return [
      {
        horizon,
        centralMae: central.harvest_weeks.mae,
        persistenceMae: at.find((m) => m.model === BASELINE_MODEL)?.harvest_weeks.mae,
        climatologyMae: at.find((m) => m.model === CLIMATOLOGY_MODEL)?.harvest_weeks.mae,
        prudentCoveragePct: at.find((m) => m.level === "prudent")?.harvest_weeks.coverage_pct,
        stressCoveragePct: at.find((m) => m.level === "stress")?.harvest_weeks.coverage_pct,
      },
    ];
  });
}

/**
 * Anticipation utile : le plus long horizon, en partant d'une semaine, jusqu'où la prévision
 * centrale fait mieux que la climatologie (la moyenne des saisons passées). Null si jamais.
 */
export function usefulHorizon(rows: HorizonSummary[]): number | null {
  let useful: number | null = null;
  for (const r of rows) {
    if (r.climatologyMae === undefined || r.centralMae >= r.climatologyMae) break;
    useful = r.horizon;
  }
  return useful;
}

export const weeksLabel = (n: number) => `${n} semaine${n > 1 ? "s" : ""}`;
