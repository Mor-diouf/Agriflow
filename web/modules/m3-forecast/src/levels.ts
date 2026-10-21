import type { ForecastLevel } from "@agriflow/api-client";

/** Niveaux de prévision du M3 (core/m3_forecast/outputs.py) et quantile visé par les niveaux prudent et stress. */
export const LEVELS: { value: ForecastLevel; label: string; quantile?: number }[] = [
  { value: "central", label: "Central" },
  { value: "prudent", label: "Prudent", quantile: 0.75 },
  { value: "stress", label: "Stress", quantile: 0.9 },
];

export const levelMeta = (level: ForecastLevel) => LEVELS.find((l) => l.value === level)!;

/** Modèle de référence naïf du benchmark M3 : il reprend la récolte de la semaine précédente. */
export const BASELINE_MODEL = "Persistence";

export type Calibration = "calibrated" | "too_low" | "too_wide";

/**
 * Couverture observée d'un quantile face à sa cible. Tolérance : deux écarts-types binomiaux,
 * un peu optimiste car des semaines successives ne sont pas indépendantes.
 */
export function calibration(coveragePct: number, quantile: number, weeks: number): Calibration {
  const tolerance = 2 * Math.sqrt((quantile * (1 - quantile)) / weeks);
  const coverage = coveragePct / 100;
  if (coverage < quantile - tolerance) return "too_low";
  if (coverage > quantile + tolerance) return "too_wide";
  return "calibrated";
}
