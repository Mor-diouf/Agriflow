import { useState } from "react";
import type { SeriesPoint } from "@/lib/forecast/service";

export type ChartVariable = "volume" | "capacite" | "ecart";
type Props = { data: SeriesPoint[]; capacity: number; variable: ChartVariable; currentWeek: number; zoneName: string; height?: number };

const W = 920, PL = 48, PR = 16, PT = 22, PB = 34;

export function ForecastChart({ data, capacity, variable, currentWeek, zoneName, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const ecart = variable === "ecart";
  const val = (v: number | null) => (v === null ? null : ecart ? v - capacity : v);
  const all = data.flatMap((d) => [val(d.actual), val(d.upper), val(d.lower), val(d.predicted)]).filter((v): v is number => v !== null);
  if (variable === "capacite" && !ecart) all.push(capacity);
  if (ecart) all.push(0);
  const max = Math.max(...all, 1) * 1.08;
  const min = ecart ? Math.min(...all, 0) * 1.08 : 0;
  const n = Math.max(data.length - 1, 1);
  const x = (i: number) => PL + (i / n) * (W - PL - PR);
  const y = (v: number) => PT + (1 - (v - min) / (max - min || 1)) * (H - PT - PB);
  const todayIdx = data.findIndex((d) => d.weekIndex === currentWeek);
  const line = (pick: (d: SeriesPoint) => number | null) => {
    let path = ""; let pen = false;
    data.forEach((d, i) => { const v = val(pick(d)); if (v === null) { pen = false; return; } path += `${pen ? "L" : "M"}${x(i)},${y(v)} `; pen = true; });
    return path;
  };
  const future = data.map((d, i) => ({ d, i })).filter(({ d }) => d.upper !== null && d.lower !== null && d.weekIndex >= currentWeek);
  const band = future.length ? `M${future.map(({ d, i }) => `${x(i)},${y(val(d.upper) ?? 0)}`).join(" L")} L${[...future].reverse().map(({ d, i }) => `${x(i)},${y(val(d.lower) ?? 0)}`).join(" L")} Z` : "";
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const h = hover !== null ? data[hover] : undefined;

  return <div className="relative">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" role="img" aria-label="Historique et prévision des volumes" onMouseLeave={() => setHover(null)}>
      {todayIdx >= 0 && <rect x={x(todayIdx)} y={PT} width={W - PR - x(todayIdx)} height={H - PT - PB} fill="var(--color-primary)" opacity="0.04" />}
      {ticks.map((t) => <g key={t}><line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeDasharray="2 4" /><text x={PL - 8} y={y(t) + 3} textAnchor="end" className="chart-label">{Math.round(t)}</text></g>)}
      {ecart && <line x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} stroke="var(--color-muted-foreground)" />}
      {band && <path d={band} fill="var(--color-chart-2)" opacity="0.16" />}
      {variable === "capacite" && <g><line x1={PL} x2={W - PR} y1={y(capacity)} y2={y(capacity)} stroke="var(--color-secondary-route)" strokeDasharray="6 4" strokeWidth="1.5" /><text x={W - PR} y={y(capacity) - 6} textAnchor="end" className="chart-label" fill="var(--color-secondary-route)">Capacité hebdo. (hypothèse) {capacity} t</text></g>}
      <path d={line((d) => (d.weekIndex >= currentWeek ? d.predicted : null))} fill="none" stroke="var(--color-chart-2)" strokeWidth="2.2" strokeDasharray="6 4" />
      <path d={line((d) => (d.weekIndex <= currentWeek ? d.predicted : null))} fill="none" stroke="var(--color-chart-2)" strokeWidth="1.2" opacity="0.45" />
      <path d={line((d) => d.actual)} fill="none" stroke="var(--color-primary)" strokeWidth="2.4" />
      {data.map((d, i) => d.actual !== null && <circle key={d.week} cx={x(i)} cy={y(val(d.actual) ?? 0)} r="2.6" fill="var(--color-primary)" />)}
      {todayIdx >= 0 && <g><line x1={x(todayIdx)} x2={x(todayIdx)} y1={PT - 8} y2={H - PB} stroke="var(--color-foreground)" opacity="0.6" /><text x={x(todayIdx) - 6} y={PT - 10} textAnchor="end" className="chart-label">HISTORIQUE</text><text x={x(todayIdx) + 6} y={PT - 10} className="chart-label">PRÉVISION</text><text x={x(todayIdx)} y={H - 4} textAnchor="middle" className="chart-label" fontWeight="700">Aujourd’hui</text></g>}
      {data.map((d, i) => (i % 2 === 0 || data.length < 12) && i !== todayIdx && <text key={d.week} x={x(i)} y={H - 16} textAnchor="middle" className="chart-label">W{d.weekIndex}</text>)}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} stroke="var(--color-muted-foreground)" strokeDasharray="3 3" />}
      {data.map((d, i) => <rect key={d.week} x={x(i) - (W - PL - PR) / n / 2} y={PT} width={(W - PL - PR) / n} height={H - PT - PB} fill="transparent" onMouseEnter={() => setHover(i)} />)}
    </svg>
    {h && hover !== null && <div className="chart-tooltip" style={{ left: `${Math.min(78, (x(hover) / W) * 100)}%` }}>
      <b>{h.week}</b><span className="text-muted-foreground">{zoneName}</span>
      <dl><dt>Observé</dt><dd>{h.actual !== null ? `${h.actual} t` : h.horizon > 0 ? "—" : "Non disponible"}</dd>
        <dt>Prévision</dt><dd>{h.predicted ?? "—"} t</dd><dt>Borne basse</dt><dd>{h.lower ?? "—"} t</dd><dt>Borne haute</dt><dd>{h.upper ?? "—"} t</dd>
        {ecart && <><dt>Écart capacité</dt><dd>{h.predicted !== null ? `${Math.round((h.predicted - capacity) * 10) / 10} t` : "—"}</dd></>}</dl>
      <small>{h.horizon > 0 ? `Sortie du modèle · S+${h.horizon}` : "Donnée simulée"}</small>
    </div>}
  </div>;
}
