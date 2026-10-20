import type { CalcLogEntry, DataStatus, ForecastPoint, ModelPerformance, WeatherPoint } from "./types";
import realForecastData from "@/lib/data/module3_forecast_real.json";

/** Données réelles issues de la Phase I (Module 3 — SM10 Agro). */
export const MODEL = {
  name: "Hurdle-SARIMAX(1,0,0)+Exog",
  version: "Phase I Tri-Niveaux (Kalman + Quantiles)",
  horizon: 8,
  trainedAt: "24/09/2026",
  forecastAt: "24/09/2026"
};

/** Capacité usine Bambali : 8 500 t/an = 163.5 t/semaine (52 semaines d'exploitation). */
export const CAPACITY = {
  annual: 8500,
  weeksAssumed: 52,
  get weekly() {
    return Math.round((this.annual / this.weeksAssumed) * 10) / 10;
  }
};

/** Les 5 zones officielles de Casamance validées lors des Phases B, F, H et I. */
export const DEMO_ZONES = [
  { id: "bignona", name: "Bignona", share: 0.28, peakShift: 0, coordinates: { x: 250, y: 120 } },
  { id: "kolda", name: "Kolda", share: 0.15, peakShift: 2, coordinates: { x: 820, y: 170 } },
  { id: "oussouye", name: "Oussouye", share: 0.12, peakShift: -1, coordinates: { x: 190, y: 310 } },
  { id: "sedhiou", name: "Sédhiou", share: 0.25, peakShift: 1, coordinates: { x: 610, y: 175 } },
  { id: "ziguinchor", name: "Ziguinchor", share: 0.20, peakShift: -1, coordinates: { x: 190, y: 215 } },
] as const;

export const FIRST_WEEK = 18;
export const CURRENT_WEEK = 30; // Semaine pivot de pic en Casamance
export const LAST_WEEK = 38;

export const weekLabel = (w: number) => `2025-W${String(w).padStart(2, "0")}`;

// Mapping direct des points depuis module3_forecast_real.json
function buildPoints(): ForecastPoint[] {
  const out: ForecastPoint[] = [];
  const zoneMap: Record<string, string> = {
    bignona: "Bignona",
    kolda: "Kolda",
    oussouye: "Oussouye",
    sedhiou: "Sédhiou",
    ziguinchor: "Ziguinchor"
  };

  DEMO_ZONES.forEach((z) => {
    const realZoneName = zoneMap[z.id] || z.name;
    const traj = (realForecastData.zone_trajectories as Record<string, Array<{
      week: number;
      weekLabel: string;
      y_true: number;
      forecast_central: number;
      forecast_prudent: number;
      forecast_stress: number;
      is_pic: boolean;
    }>>)[realZoneName] || [];

    traj.forEach((pt) => {
      const w = pt.week;
      if (w >= FIRST_WEEK && w <= LAST_WEEK) {
        const horizon = Math.max(0, w - CURRENT_WEEK);
        const actual = horizon === 0 ? pt.y_true : null;
        out.push({
          id: `${z.id}-${w}`,
          zoneId: z.id,
          week: weekLabel(w),
          weekIndex: w,
          horizon,
          predictedVolume: pt.forecast_central,
          lowerBound: pt.forecast_prudent, // Q0.75 (Prudent)
          upperBound: pt.forecast_stress,  // Q0.90 (Stress-Test Capacité)
          actualVolume: actual,
          modelVersion: MODEL.version,
          dataStatus: horizon === 0 ? "simule" : "modele"
        });
      }
    });
  });
  return out;
}

export const FORECAST_POINTS: ForecastPoint[] = buildPoints();

export const WEATHER: WeatherPoint[] = Array.from({ length: LAST_WEEK - FIRST_WEEK + 1 }, (_, i) => {
  const w = FIRST_WEEK + i;
  const future = w > CURRENT_WEEK;
  const status: DataStatus = future ? "a_obtenir" : "simule";
  return {
    week: weekLabel(w),
    dataStatus: status,
    rain: future ? null : Math.round((28 + 52 * Math.exp(-((w - 28) ** 2) / 35)) * 10) / 10,
    tempMean: future ? null : 28.4,
    tempMax: future ? null : 33.1,
    humidity: future ? null : 78,
  };
});

/** Résultats officiels du protocole expérimental validé (Phase I, 1 040 obs OOS 2022-2025). */
export const BENCHMARK: ModelPerformance[] = [
  {
    modelName: "Persistence (Baseline Y_t-1)",
    mae: 3.75,
    rmse: 7.42,
    bias: 0.00,
    status: "Référence",
    evaluationProtocol: "Walk-forward temporel 2022-2025",
    validationPeriod: "1 040 obs (Biais pics: -4.11 t)"
  },
  {
    modelName: "Hurdle-Ridge + Duan",
    mae: 3.64,
    rmse: 8.00,
    bias: -1.60,
    status: "Actuel",
    evaluationProtocol: "Walk-forward temporel 2022-2025",
    validationPeriod: "1 040 obs (Biais pics: -7.08 t)"
  },
  {
    modelName: "Hurdle-SARIMAX(1,0,0)+Exog",
    mae: 2.77,
    rmse: 5.55,
    bias: 0.39,
    status: "Validé",
    evaluationProtocol: "Walk-forward temporel 2022-2025",
    validationPeriod: "1 040 obs (Biais pics: -6.43 t, PL_0.50: 1.38)"
  },
  {
    modelName: "Hurdle-Quantile(0.75)",
    mae: 3.33,
    rmse: 6.46,
    bias: 1.57,
    status: "Validé",
    evaluationProtocol: "Walk-forward temporel 2022-2025",
    validationPeriod: "1 040 obs (Biais pics: -2.53 t, PL_0.75: 1.27)"
  },
  {
    modelName: "Hurdle-Quantile(0.90)",
    mae: 5.69,
    rmse: 10.05,
    bias: 5.00,
    status: "Expérimental",
    evaluationProtocol: "Walk-forward temporel 2022-2025",
    validationPeriod: "1 040 obs (Biais pics: +6.74 t, Biais S1: -0.28 t)"
  },
];

export const MODEL_VARIABLES = [
  { name: "Harmoniques de Fourier (s=52)", detail: "Capture la composante saisonnière annuelle par 4 termes sin/cos." },
  { name: "Pluie retardée causale (P_lag)", detail: "Lag optimal par zone (5 à 8 semaines) basé sur l'analyse de cross-corrélation." },
  { name: "Température lissée (T_roll4)", detail: "Moyenne mobile 4 semaines influençant le rythme de maturation." },
  { name: "Tendance séculaire (t_global)", detail: "Normalisée (t / 52) pour modéliser la croissance des vergers." },
  { name: "Mémoire autorégressive (Y_t-1)", detail: "Volume strictement retardé pour capturer la persistance dynamique." },
  { name: "Étage Hurdle (Classification B-splines)", detail: "Prédiction de l'activation saisonnière (Y > 0) par régression logistique." },
];

export const INITIAL_CALC_LOG: CalcLogEntry[] = [
  { at: "24/09/2026 — 16:30", action: "Module 4 : Connexion des flux tri-niveaux", model: `${MODEL.name} · ${MODEL.version}`, horizon: "8 semaines" },
  { at: "24/09/2026 — 01:35", action: "Phase I finalisée (Quantiles Q0.50, Q0.75, Q0.90)", model: `${MODEL.name} · ${MODEL.version}`, horizon: "8 semaines" },
  { at: "23/09/2026 — 21:00", action: "Phase H.2 validée (Diagnostic p=2 & Delta Y)", model: "Hurdle-SARIMAX(1,0,0)+Exog", horizon: "8 semaines" },
  { at: "22/09/2026 — 18:00", action: "Phase H validée (SARIMAX Kalman Filter)", model: "Hurdle-SARIMAX(1,0,0)+Exog", horizon: "8 semaines" },
];
