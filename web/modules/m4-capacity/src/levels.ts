import type { ForecastLevel } from "@agriflow/api-client";

/** Niveaux de prévision du M3 (core/m3_forecast/outputs.py), du plus probable au plus pessimiste. */
export const LEVELS: { value: ForecastLevel; label: string; detail: string }[] = [
  { value: "central", label: "Central", detail: "Prévision centrale (Hurdle-SARIMAX)" },
  { value: "prudent", label: "Prudent", detail: "Quantile 75 % : dépassé une semaine sur quatre" },
  { value: "stress", label: "Stress", detail: "Quantile 90 % : dépassé une semaine sur dix" },
];

export const levelMeta = (level: ForecastLevel) => LEVELS.find((l) => l.value === level)!;

/** Jours ouvrés retenus pour la capacité de référence (D1), et hypothèse d'une usine qui ne tourne qu'en saison. */
export const REFERENCE_WORKING_DAYS = 300;
export const SEASONAL_WORKING_DAYS = 90;
export const SEASONAL_CAPACITY_FACTOR = REFERENCE_WORKING_DAYS / SEASONAL_WORKING_DAYS;
