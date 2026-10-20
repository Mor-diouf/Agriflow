import rawProducersData from "./data/module2_producers_real.json";

export type ClusterId = "strategic" | "regular" | "emerging" | "at-risk";
export type Level = "High" | "Medium" | "Low";

export type Producer = {
  id: string;
  zone: string;
  area: number;
  production: number;
  regularity: number;
  quality: number;
  priority: number;
  risk: number;
  cluster: ClusterId;
  lastDelivery: number;
  status: "ACTIVE" | "MONITOR" | "INACTIVE";
  deliveries: number;
  delay: number;
  productionVariability: number;
  qualityVariability: number;
  confidence: number;
  x: number;
  y: number;
  history: Array<{ month: string; production: number; deliveries: number; quality: number }>;
};

export const CLUSTER_DEFAULTS: Record<ClusterId, string> = {
  strategic: "Profil A — Stratégique",
  regular: "Profil B — Régulier",
  emerging: "Émergent",
  "at-risk": "À Risque",
};

export const ZONES = ["Bignona", "Kolda", "Oussouye", "Sédhiou", "Ziguinchor"];
const MONTHS = ["Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep"];

// Seasonal weights for Casamance mango production across months
const MONTH_SEASONALITY = [0.05, 0.05, 0.05, 0.1, 0.15, 0.35, 0.65, 1.0, 0.85, 0.4, 0.1, 0.05];

export const PRODUCERS: Producer[] = (rawProducersData.producers as any[]).map((p, idx) => {
  const quality = Math.round(100 - p.rejection_pct);
  const status: "ACTIVE" | "MONITOR" | "INACTIVE" = 
    p.score_risque > 40 ? "MONITOR" : p.regularity_pct < 75 ? "INACTIVE" : "ACTIVE";
  
  const history = MONTHS.map((month, mIdx) => {
    const seasonFactor = MONTH_SEASONALITY[mIdx] ?? 0.1;
    const monthlyProd = +(p.production_total_t * seasonFactor * 0.3).toFixed(1);
    const deliveries = seasonFactor > 0.3 ? (seasonFactor > 0.7 ? 4 : 2) : 1;
    const mQuality = Math.min(99, Math.max(70, Math.round(quality + ((mIdx % 3) - 1))));
    return {
      month,
      production: monthlyProd,
      deliveries,
      quality: mQuality,
    };
  });

  return {
    id: p.id,
    zone: p.zone,
    area: p.area_ha,
    production: p.production_total_t,
    regularity: Math.round(p.regularity_pct),
    quality,
    priority: Math.round(p.score_logistique),
    risk: Math.round(p.score_risque),
    cluster: (p.cluster as ClusterId) || "regular",
    lastDelivery: ((idx * 3) % 28) + 1,
    status,
    deliveries: Math.round(p.production_total_t / 1.2) + 2,
    delay: +(0.5 + (p.score_risque / 100) * 3).toFixed(1),
    productionVariability: +(12 - (p.regularity_pct / 10)).toFixed(1),
    qualityVariability: +(p.rejection_pct * 0.6).toFixed(1),
    confidence: Math.round(98 - p.score_risque * 0.25),
    x: p.x,
    y: p.y,
    history,
  };
});

export const KPI_M2 = [
  { label: "TOTAL PRODUCTEURS", value: "100", delta: "100%", detail: "Portefeuille scoré Module 2", tone: "neutral" },
  { label: "PRODUCTEURS ACTIFS", value: "94", delta: "94.0%", detail: "Taux d'engagement filière", tone: "positive" },
  { label: "PROFIL A (STRATÉGIQUE)", value: "62", delta: "62.0%", detail: "Priorité tournées & contrats", tone: "positive" },
  { label: "SCORE LOGISTIQUE MOY.", value: "50.1", unit: "/ 100", delta: "+5.4 pts", detail: "Régularité & accès usine", tone: "positive" },
  { label: "EXPOSITION AU RISQUE", value: "17.2%", delta: "Profil A", detail: "Risque moyen Profil A", tone: "positive" },
  { label: "COUVERTURE DONNÉES", value: "100%", delta: "K-MEANS k=4", detail: "Scoring multicritère certifié", tone: "neutral" },
] as const;

export const ELBOW = [
  { k: 2, inertia: 784.0, silhouette: 0.52 },
  { k: 3, inertia: 562.0, silhouette: 0.62 },
  { k: 4, inertia: 428.6, silhouette: 0.71 },
  { k: 5, inertia: 376.0, silhouette: 0.65 },
  { k: 6, inertia: 341.0, silhouette: 0.59 },
];

export const levelFor = (score: number): Level => score >= 70 ? "High" : score >= 45 ? "Medium" : "Low";
