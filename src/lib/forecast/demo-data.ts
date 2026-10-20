import type { CalcLogEntry, DataStatus, ForecastPoint, ModelPerformance, WeatherPoint } from "./types";

/** Jeu de démonstration déterministe — toutes les valeurs sont SIMULÉES. */
export const MODEL = { name: "Hurdle-Ridge + Duan", version: "F-1.0", horizon: 8, trainedAt: "18/09/2026", forecastAt: "24/09/2026" };
export const FIRST_WEEK = 26;
export const CURRENT_WEEK = 38; // dernière semaine observée
export const LAST_WEEK = CURRENT_WEEK + MODEL.horizon;

/** Capacité : 8 500 t/an = donnée projet ; conversion hebdomadaire = hypothèse (52 semaines d'exploitation). */
export const CAPACITY = { annual: 8500, weeksAssumed: 52, get weekly() { return Math.round((this.annual / this.weeksAssumed) * 10) / 10; } };

export const DEMO_ZONES = [
  { id: "bambali", name: "Bambali", share: 0.17, peakShift: 0, coordinates: { x: 520, y: 150 } },
  { id: "bignona", name: "Bignona", share: 0.2, peakShift: -1, coordinates: { x: 250, y: 120 } },
  { id: "ziguinchor", name: "Ziguinchor", share: 0.16, peakShift: -1, coordinates: { x: 190, y: 215 } },
  { id: "sedhiou", name: "Sédhiou", share: 0.21, peakShift: 1, coordinates: { x: 610, y: 175 } },
  { id: "kolda", name: "Kolda", share: 0.16, peakShift: 2, coordinates: { x: 820, y: 170 } },
  { id: "velingara", name: "Vélingara", share: 0.1, peakShift: 3, coordinates: { x: 980, y: 150 } },
] as const;

const rand = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const r1 = (v: number) => Math.round(v * 10) / 10;
export const weekLabel = (w: number) => `2026-W${String(w).padStart(2, "0")}`;

/** Courbe saisonnière simulée (tonnes/semaine, toutes zones). */
function seasonal(week: number, shift: number) {
  const peak = 41 + shift;
  return 30 + 165 * Math.exp(-((week - peak) ** 2) / 26);
}

function buildPoints(): ForecastPoint[] {
  const out: ForecastPoint[] = [];
  DEMO_ZONES.forEach((z, zi) => {
    for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) {
      const base = seasonal(w, z.peakShift) * z.share;
      const noise = (rand(w * 7 + zi * 31) - 0.5) * 0.18 * base;
      const horizon = Math.max(0, w - CURRENT_WEEK);
      const missing = horizon === 0 && rand(w * 3 + zi * 11) < 0.035;
      const actual = horizon === 0 && !missing ? r1(base + noise) : null;
      // Prévision rétrospective (walk-forward simulé) pour l'historique, prévision future au-delà.
      const bias = (rand(w * 5 + zi) - 0.55) * 0.12 * base;
      const predicted = r1(base + bias);
      const spread = base * (0.07 + 0.025 * Math.max(1, horizon));
      out.push({
        id: `${z.id}-${w}`, zoneId: z.id, week: weekLabel(w), weekIndex: w, horizon,
        predictedVolume: predicted, lowerBound: r1(Math.max(0, predicted - spread)), upperBound: r1(predicted + spread),
        actualVolume: actual, modelVersion: MODEL.version, dataStatus: horizon === 0 ? "simule" : "modele",
      });
    }
  });
  return out;
}
export const FORECAST_POINTS = buildPoints();

export const WEATHER: WeatherPoint[] = Array.from({ length: LAST_WEEK - FIRST_WEEK + 1 }, (_, i) => {
  const w = FIRST_WEEK + i;
  const future = w > CURRENT_WEEK;
  const status: DataStatus = future ? "a_obtenir" : "simule";
  return {
    week: weekLabel(w), dataStatus: status,
    rain: future ? null : r1(18 + 42 * Math.exp(-((w - 34) ** 2) / 30) + rand(w) * 14),
    tempMean: future ? null : r1(27.2 + rand(w + 3) * 2.6),
    tempMax: future ? null : r1(31.5 + rand(w + 9) * 3.4),
    humidity: future ? null : Math.round(72 + rand(w + 5) * 16),
  };
});

/** Résultats du protocole expérimental fourni (walk-forward). Les autres modèles restent à renseigner. */
export const BENCHMARK: ModelPerformance[] = [
  { modelName: "Persistence", mae: null, rmse: null, bias: null, status: "Référence", evaluationProtocol: "Walk-forward temporel", validationPeriod: "À renseigner" },
  { modelName: "Hurdle-Ridge", mae: null, rmse: null, bias: null, status: "Validé", evaluationProtocol: "Walk-forward temporel", validationPeriod: "À renseigner" },
  { modelName: "Hurdle-Ridge + Duan", mae: 3.64, rmse: 7.99, bias: -1.6, status: "Actuel", evaluationProtocol: "Walk-forward temporel", validationPeriod: "Données historiques" },
  { modelName: "Hurdle-RF", mae: null, rmse: null, bias: null, status: "Expérimental", evaluationProtocol: "Walk-forward temporel", validationPeriod: "À renseigner" },
  { modelName: "SARIMAX", mae: null, rmse: null, bias: null, status: "À évaluer", evaluationProtocol: "—", validationPeriod: "—" },
];

export const MODEL_VARIABLES = [
  { name: "Volume semaine précédente", detail: "Volume observé en S-1 dans la zone (variable retardée)." },
  { name: "Moyenne mobile 3 semaines", detail: "Lisse les variations ponctuelles de livraison." },
  { name: "Précipitations retardées", detail: "Cumul de pluie des semaines S-2 à S-4." },
  { name: "Température moyenne", detail: "Influence la vitesse de maturation." },
  { name: "Humidité relative", detail: "Variable météorologique complémentaire." },
  { name: "Saison / semaine de campagne", detail: "Position dans le cycle de récolte." },
];

export const INITIAL_CALC_LOG: CalcLogEntry[] = [
  { at: "24/09/2026 — 14:32", action: "Prévision générée", model: `${MODEL.name} · ${MODEL.version}`, horizon: "8 semaines" },
  { at: "23/09/2026 — 17:10", action: "Prévision recalculée", model: `${MODEL.name} · ${MODEL.version}`, horizon: "8 semaines" },
  { at: "18/09/2026 — 09:05", action: "Modèle ré-entraîné", model: `${MODEL.name} · ${MODEL.version}`, horizon: "—" },
];
