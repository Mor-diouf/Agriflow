/** Types du Module 03. Conçus pour être alimentés plus tard par une API (Python/FastAPI ou base connectée). */
export type DataStatus = "reel" | "simule" | "hypothese" | "modele" | "a_obtenir";

export type ForecastPoint = {
  id: string;
  zoneId: string;
  week: string; // ISO 2026-W39
  weekIndex: number;
  horizon: number; // 0 = historique
  predictedVolume: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  actualVolume: number | null;
  modelVersion: string;
  dataStatus: DataStatus;
};

export type ForecastZone = {
  id: string;
  name: string;
  coordinates: { x: number; y: number }; // positions schématiques (démo)
  historicalVolume: number;
  forecastVolume: number;
  trend: "hausse" | "stable" | "baisse";
};

export type WeatherPoint = { week: string; rain: number | null; tempMean: number | null; tempMax: number | null; humidity: number | null; dataStatus: DataStatus };

export type ModelPerformance = {
  modelName: string;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  status: "Référence" | "Validé" | "Actuel" | "Expérimental" | "À évaluer";
  evaluationProtocol: string;
  validationPeriod: string;
};

export type CalcLogEntry = { at: string; action: string; model: string; horizon: string };
