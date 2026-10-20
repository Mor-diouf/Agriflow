export type ClusterId = "strategic" | "regular" | "emerging" | "at-risk";
export type Level = "High" | "Medium" | "Low";
export type Producer = {
  id: string; zone: string; area: number; production: number; regularity: number;
  quality: number; priority: number; risk: number; cluster: ClusterId; lastDelivery: number;
  status: "ACTIVE" | "MONITOR" | "INACTIVE"; deliveries: number; delay: number;
  productionVariability: number; qualityVariability: number; confidence: number;
  x: number; y: number; history: Array<{ month: string; production: number; deliveries: number; quality: number }>;
};

export const CLUSTER_DEFAULTS: Record<ClusterId, string> = {
  strategic: "Strategic", regular: "Regular", emerging: "Emerging", "at-risk": "At Risk",
};
export const ZONES = ["Bambali", "Bignona", "Ziguinchor", "Sédhiou", "Kolda", "Vélingara"];
const MONTHS = ["Oct", "Nov", "Déc", "Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep"];
const random = (n: number, salt: number) => {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453123;
  return x - Math.floor(x);
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const between = (n: number, salt: number, min: number, max: number) => min + random(n, salt) * (max - min);
const gaussian = (n: number, salt: number, mean: number, deviation: number) => {
  const u1 = Math.max(random(n, salt), 0.0001);
  const u2 = random(n, salt + 1);
  return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * deviation;
};

function clusterFor(index: number): ClusterId {
  const r = random(index, 3);
  if (r < .145) return "strategic";
  if (r < .473) return "regular";
  if (r < .776) return "emerging";
  return "at-risk";
}
const profiles: Record<ClusterId, { production: [number, number]; regularity: [number, number]; quality: [number, number]; area: [number, number] }> = {
  strategic: { production: [43, 6.4], regularity: [93, 3.2], quality: [91, 2.9], area: [18, 2.7] },
  regular: { production: [29, 4.8], regularity: [86, 4.2], quality: [84, 4.1], area: [13, 2.3] },
  emerging: { production: [17, 4.1], regularity: [72, 5.6], quality: [78, 4.9], area: [8.8, 2.1] },
  "at-risk": { production: [11, 3.9], regularity: [56, 8.5], quality: [64, 6.5], area: [5.8, 1.9] },
};
const DEFAULT_ZONE_CENTER = { x: 51, y: 48, spreadX: 6, spreadY: 6.5 };
const zoneCenters: Record<string, { x: number; y: number; spreadX: number; spreadY: number }> = {
  Ziguinchor: { x: 17, y: 58, spreadX: 5.5, spreadY: 7.5 },
  Bignona: { x: 28, y: 35, spreadX: 6.5, spreadY: 6 },
  Bambali: DEFAULT_ZONE_CENTER,
  Sédhiou: { x: 64, y: 43, spreadX: 7, spreadY: 6 },
  Kolda: { x: 79, y: 63, spreadX: 6.5, spreadY: 7 },
  Vélingara: { x: 91, y: 55, spreadX: 4.5, spreadY: 6.5 },
};

export const PRODUCERS: Producer[] = Array.from({ length: 1284 }, (_, position) => {
  const index = position + 1;
  const cluster = clusterFor(index);
  const profile = profiles[cluster];
  const zone = ZONES[Math.floor(random(index, 31) * ZONES.length)] ?? "Bambali";
  const zoneCenter = zoneCenters[zone] ?? DEFAULT_ZONE_CENTER;
  const production = +clamp(gaussian(index, 7, ...profile.production), 4.2, 58).toFixed(1);
  const regularity = Math.round(clamp(gaussian(index, 11, ...profile.regularity), 32, 99));
  const quality = Math.round(clamp(gaussian(index, 17, ...profile.quality), 45, 98));
  const area = +clamp(gaussian(index, 23, ...profile.area), 1.6, 26).toFixed(1);
  const priority = Math.max(12, Math.min(98, Math.round(production * .7 + regularity * .38 + quality * .25 - 9 + between(index, 24, -3, 3))));
  const risk = Math.max(4, Math.min(94, Math.round((100 - regularity) * .72 + (100 - quality) * .55 + between(index, 29, 0, 12))));
  const history = MONTHS.map((month, monthIndex) => ({
    month,
    production: +(production * between(index + monthIndex, 37, .78, 1.12)).toFixed(1),
    deliveries: Math.max(1, Math.round(between(index + monthIndex, 41, 1, 4))),
    quality: Math.max(45, Math.min(99, Math.round(quality + between(index + monthIndex, 43, -5, 5)))),
  }));
  return {
    id: `P-${String(index).padStart(6, "0")}`, zone, area, production, regularity, quality, priority, risk, cluster,
    lastDelivery: Math.round(between(index, 47, 1, 35)),
    status: risk > 58 ? "MONITOR" : random(index, 53) > .91 ? "INACTIVE" : "ACTIVE",
    deliveries: Math.round(between(index, 59, 8, 25)), delay: +between(index, 61, .2, 4.8).toFixed(1),
    productionVariability: +between(index, 67, 4, 22).toFixed(1), qualityVariability: +between(index, 71, 2, 13).toFixed(1),
    confidence: Math.round(between(index, 73, 78, 98)),
    x: +clamp(gaussian(index, 79, zoneCenter.x, zoneCenter.spreadX), 4, 96).toFixed(3),
    y: +clamp(gaussian(index, 83, zoneCenter.y, zoneCenter.spreadY), 12, 88).toFixed(3),
    history,
  };
});

export const KPI_M2 = [
  { label: "TOTAL PRODUCERS", value: "1,284", delta: "+8.4%", detail: "Depuis la dernière période", tone: "positive" },
  { label: "ACTIVE PRODUCERS", value: "1,106", delta: "86.1%", detail: "Du portefeuille total", tone: "neutral" },
  { label: "HIGH PRIORITY", value: "186", delta: "14.5%", detail: "À intégrer aux collectes", tone: "positive" },
  { label: "AVERAGE SCORE", value: "72.4", unit: "/ 100", delta: "+4.2 pts", detail: "Score de priorité", tone: "positive" },
  { label: "RISK EXPOSURE", value: "12.8%", delta: "−2.1 pts", detail: "Profils sous surveillance", tone: "positive" },
  { label: "DATA COVERAGE", value: "91.6%", delta: "QUALITY", detail: "Qualité des données disponibles", tone: "neutral" },
] as const;

export const ELBOW = [
  { k: 2, inertia: 792, silhouette: .52 }, { k: 3, inertia: 566, silhouette: .64 },
  { k: 4, inertia: 428.6, silhouette: .71 }, { k: 5, inertia: 376, silhouette: .65 }, { k: 6, inertia: 341, silhouette: .59 },
];
export const levelFor = (score: number): Level => score >= 70 ? "High" : score >= 45 ? "Medium" : "Low";
