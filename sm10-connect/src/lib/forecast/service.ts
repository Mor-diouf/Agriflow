import { PRODUCERS, CLUSTER_DEFAULTS, type ClusterId } from "@/lib/module2-data";
import { CAPACITY, CURRENT_WEEK, DEMO_ZONES, FIRST_WEEK, FORECAST_POINTS, LAST_WEEK, WEATHER, weekLabel } from "./demo-data";
import type { ForecastPoint, ForecastZone } from "./types";

/**
 * Couche d'accès aux prévisions. En mode démo, lit le jeu simulé local.
 * Plus tard : remplacer par un appel à l'API du moteur de prévision (le frontend ne calcule pas la science).
 */
export type SeriesPoint = { week: string; weekIndex: number; actual: number | null; predicted: number | null; lower: number | null; upper: number | null; horizon: number };

const sum = (v: (number | null)[]) => { const f = v.filter((x): x is number => x !== null); return f.length ? Math.round(f.reduce((a, b) => a + b, 0) * 10) / 10 : null; };

export function getSeries(zoneId: string): SeriesPoint[] {
  const rows: SeriesPoint[] = [];
  for (let w = FIRST_WEEK; w <= LAST_WEEK; w++) {
    const pts = FORECAST_POINTS.filter((p) => p.weekIndex === w && (zoneId === "all" || p.zoneId === zoneId));
    const hasMissing = pts.some((p) => p.horizon === 0 && p.actualVolume === null);
    rows.push({
      week: weekLabel(w), weekIndex: w, horizon: Math.max(0, w - CURRENT_WEEK),
      actual: w <= CURRENT_WEEK && !hasMissing ? sum(pts.map((p) => p.actualVolume)) : null,
      predicted: sum(pts.map((p) => p.predictedVolume)), lower: sum(pts.map((p) => p.lowerBound)), upper: sum(pts.map((p) => p.upperBound)),
    });
  }
  return rows;
}

const at = (zoneId: string, w: number): ForecastPoint | undefined => FORECAST_POINTS.find((p) => p.zoneId === zoneId && p.weekIndex === w);

export type ZoneRow = ForecastZone & { current: number | null; s1: number; s4: number; uncertainty: number; contribution: number; mae: number | null; avg: number };
export function getZoneRows(): ZoneRow[] {
  const totalS4 = DEMO_ZONES.reduce((s, z) => s + sumRange(z.id, 1, 4), 0);
  return DEMO_ZONES.map((z) => {
    const cur = at(z.id, CURRENT_WEEK)?.actualVolume ?? null;
    const s1p = at(z.id, CURRENT_WEEK + 1);
    const s1 = s1p?.predictedVolume ?? 0;
    const s4 = sumRange(z.id, 1, 4);
    const hist = FORECAST_POINTS.filter((p) => p.zoneId === z.id && p.horizon === 0 && p.actualVolume !== null);
    const errs = hist.map((p) => Math.abs((p.predictedVolume ?? 0) - (p.actualVolume ?? 0)));
    const ref = cur ?? at(z.id, CURRENT_WEEK - 1)?.actualVolume ?? s1;
    const delta = (s1 - ref) / Math.max(ref, 1);
    return {
      id: z.id, name: z.name, coordinates: z.coordinates, current: cur, s1, s4,
      historicalVolume: sum(hist.map((p) => p.actualVolume)) ?? 0, forecastVolume: s4,
      avg: hist.length ? Math.round(((sum(hist.map((p) => p.actualVolume)) ?? 0) / hist.length) * 10) / 10 : 0,
      trend: delta > 0.04 ? "hausse" : delta < -0.04 ? "baisse" : "stable",
      uncertainty: Math.round(((s1p?.upperBound ?? 0) - (s1p?.lowerBound ?? 0)) / 2 * 10) / 10,
      contribution: Math.round((s4 / Math.max(totalS4, 1)) * 1000) / 10,
      mae: errs.length ? Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 100) / 100 : null,
    };
  });
}
function sumRange(zoneId: string, from: number, to: number) {
  let s = 0;
  for (let h = from; h <= to; h++) s += at(zoneId, CURRENT_WEEK + h)?.predictedVolume ?? 0;
  return Math.round(s * 10) / 10;
}

export function capacityState(volume: number) {
  const ratio = volume / CAPACITY.weekly;
  if (ratio > 1.05) return { key: "saturation" as const, ratio, label: "Risque de dépassement de capacité" };
  if (ratio >= 0.9) return { key: "equilibre" as const, ratio, label: "Charge industrielle compatible avec la capacité prévue" };
  return { key: "sous" as const, ratio, label: "Capacité disponible non saturée" };
}

export function getDataQuality() {
  const hist = FORECAST_POINTS.filter((p) => p.horizon === 0);
  const missing = hist.filter((p) => p.actualVolume === null).length;
  const weatherHist = WEATHER.filter((w) => w.dataStatus !== "a_obtenir");
  return {
    observations: hist.length - missing, expected: hist.length,
    missingPct: Math.round((missing / hist.length) * 1000) / 10,
    temporal: `${weekLabel(FIRST_WEEK)} → ${weekLabel(CURRENT_WEEK)}`, weeks: CURRENT_WEEK - FIRST_WEEK + 1,
    zones: DEMO_ZONES.length, weatherWeeks: weatherHist.length,
  };
}

export function getProducerSegments(zoneIds: string[]) {
  const names = new Set<string>(DEMO_ZONES.filter((z) => zoneIds.includes(z.id)).map((z) => z.name));
  const concerned = PRODUCERS.filter((p) => names.has(p.zone));
  const rows = getZoneRows().filter((r) => zoneIds.includes(r.id));
  const volume = rows.reduce((s, r) => s + r.s4, 0);
  const totalProd = concerned.reduce((s, p) => s + p.production, 0) || 1;
  const byCluster = (Object.keys(CLUSTER_DEFAULTS) as ClusterId[]).map((c) => {
    const list = concerned.filter((p) => p.cluster === c);
    const share = list.reduce((s, p) => s + p.production, 0) / totalProd;
    return { id: c, name: CLUSTER_DEFAULTS[c], count: list.length, volume: Math.round(volume * share) };
  }).filter((s) => s.count > 0);
  return { count: concerned.length, segments: byCluster, zones: rows.map((r) => r.name) };
}
