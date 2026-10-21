import type { WeeklyLoad } from "@agriflow/api-client";
import { formatNumber, formatRatio, niceTicks, useElementWidth } from "@agriflow/ui";
import { useState } from "react";

const HEIGHT = 300;
const MARGIN = { top: 28, right: 16, bottom: 32, left: 48 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

/** Semaines de la saison où il se passe quelque chose (flux prévu ou observé), avec une semaine de marge. */
export function activeWeeks(weeks: WeeklyLoad[]): WeeklyLoad[] {
  const active = weeks.map((w, i) => (w.inflow_t > 0 || w.actual_t > 0 ? i : -1)).filter((i) => i >= 0);
  if (active.length === 0) return [];
  return weeks.slice(Math.max(0, active[0] - 1), active[active.length - 1] + 2);
}

/** Colonne arrondie côté valeur (haut), carrée côté ligne de base. */
function columnPath(x: number, y: number, w: number, h: number, rounded: boolean) {
  const r = rounded ? Math.min(RADIUS, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function LoadChart({ weeks, year }: { weeks: WeeklyLoad[]; year: number }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const shown = activeWeeks(weeks);
  if (shown.length === 0) return <div className="af-empty">Aucun flux prévu pour la saison {year}.</div>;

  const capacity = shown[0].capacity_t;
  const top = Math.max(capacity, ...shown.map((w) => Math.max(w.inflow_t, w.actual_t))) * 1.08;
  const ticks = niceTicks(top);
  const yMax = ticks[ticks.length - 1];

  const plotW = Math.max(200, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotW / shown.length;
  const barW = Math.max(2, Math.min(MAX_BAR, band - 2 * GAP));
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;
  const cx = (i: number) => MARGIN.left + band * (i + 0.5);
  const labelEvery = Math.ceil(36 / band);

  const peak = shown.reduce((best, w, i) => (w.saturation > shown[best].saturation ? i : best), 0);
  const hoveredWeek = hovered === null ? null : shown[hovered];

  return (
    <div ref={ref} className="af-chart">
      <svg
        width={plotW + MARGIN.left + MARGIN.right}
        height={HEIGHT}
        role="img"
        aria-label={`Charge hebdomadaire de l'usine, saison ${year} : pic à ${formatRatio(shown[peak].saturation)} % de la capacité en semaine ${shown[peak].week}. Détail dans la vue tableau.`}
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(t)} y2={y(t)} className="af-chart__grid" />
            <text x={MARGIN.left - 8} y={y(t)} className="af-chart__tick" textAnchor="end" dominantBaseline="middle">
              {formatNumber(t)}
            </text>
          </g>
        ))}
        <text x={MARGIN.left - 8} y={MARGIN.top - 14} className="af-chart__tick" textAnchor="end">
          t
        </text>

        {hovered !== null && (
          <rect x={MARGIN.left + band * hovered} y={MARGIN.top} width={band} height={plotH} className="af-chart__hover" />
        )}

        {shown.map((w, i) => {
          const x = cx(i) - barW / 2;
          const below = Math.min(w.inflow_t, capacity);
          const over = w.inflow_t > capacity;
          const belowTop = over ? y(capacity) + GAP / 2 : y(below);
          return (
            <g key={w.week}>
              {below > 0 && (
                <path
                  d={columnPath(x, belowTop, barW, y(0) - belowTop, !over)}
                  fill="var(--af-chart-forecast)"
                />
              )}
              {over && (
                <path
                  d={columnPath(x, y(w.inflow_t), barW, y(capacity) - GAP / 2 - y(w.inflow_t), true)}
                  fill="var(--af-danger-600)"
                />
              )}
            </g>
          );
        })}

        <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(capacity)} y2={y(capacity)} className="af-chart__threshold" />
        <text x={MARGIN.left + plotW} y={y(capacity) - 8} className="af-chart__label" textAnchor="end">
          Capacité {formatNumber(capacity, 1)} t/sem
        </text>

        {shown.map((w, i) =>
          w.actual_t > 0 ? (
            <circle key={w.week} cx={cx(i)} cy={y(w.actual_t)} r={4} className="af-chart__dot" />
          ) : null,
        )}

        {shown[peak].saturation > 0 && (
          <text x={cx(peak)} y={y(Math.max(shown[peak].inflow_t, shown[peak].actual_t)) - 10} className="af-chart__label" textAnchor="middle">
            {formatRatio(shown[peak].saturation)} %
          </text>
        )}

        {shown.map((w, i) =>
          i % labelEvery === 0 ? (
            <text key={w.week} x={cx(i)} y={HEIGHT - MARGIN.bottom + 18} className="af-chart__tick" textAnchor="middle">
              S{w.week}
            </text>
          ) : null,
        )}

        {/* Zones de survol : toute la hauteur de la semaine, plus large que la colonne */}
        {shown.map((w, i) => (
          <rect
            key={w.week}
            x={MARGIN.left + band * i}
            y={MARGIN.top}
            width={band}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onClick={() => setHovered(i)}
          />
        ))}
      </svg>

      {hoveredWeek && hovered !== null && (
        <div
          className="af-chart__tooltip"
          role="status"
          style={{
            left: Math.min(Math.max(cx(hovered), 110), plotW + MARGIN.left + MARGIN.right - 110),
            top: MARGIN.top,
          }}
        >
          <div className="af-chart__tooltip-title">
            Semaine {hoveredWeek.week} · {year}
          </div>
          <dl>
            <dt>Flux prévu</dt>
            <dd>{formatNumber(hoveredWeek.inflow_t, 1)} t</dd>
            <dt>Flux observé</dt>
            <dd>{formatNumber(hoveredWeek.actual_t, 1)} t</dd>
            <dt>Charge</dt>
            <dd>{formatRatio(hoveredWeek.saturation)} %</dd>
            {hoveredWeek.excess_t > 0 && (
              <>
                <dt>Excédent</dt>
                <dd>{formatNumber(hoveredWeek.excess_t, 1)} t</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

/** Légende du graphique : toujours présente, l'identité ne repose jamais sur la seule couleur. */
export function LoadChartLegend() {
  return (
    <div className="af-chart-legend">
      <span><i className="af-chart-legend__bar" style={{ background: "var(--af-chart-forecast)" }} />Flux prévu absorbé</span>
      <span><i className="af-chart-legend__bar" style={{ background: "var(--af-danger-600)" }} />Excédent au-delà de la capacité</span>
      <span><i className="af-chart-legend__dot" />Flux observé</span>
      <span><i className="af-chart-legend__line" />Capacité usine</span>
    </div>
  );
}
