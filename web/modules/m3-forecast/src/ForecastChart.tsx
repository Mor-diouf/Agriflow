import { formatNumber, formatTonnes, niceTicks, useElementWidth } from "@agriflow/ui";
import { useState, type KeyboardEvent } from "react";

import type { WeekForecast } from "./series";

const HEIGHT = 300;
const MARGIN = { top: 28, right: 16, bottom: 32, left: 48 };
const TOOLTIP_OFFSET = 16;
const TOOLTIP_WIDTH = 224;

const describeWeek = (w: WeekForecast) =>
  `Semaine ${w.week} : récolte observée ${formatTonnes(w.actual_t, 1)}, prévision centrale ${formatTonnes(w.central_t, 1)}, ` +
  `prudent ${formatTonnes(w.prudent_t, 1)}, stress ${formatTonnes(w.stress_t, 1)}.`;

/**
 * Prévision centrale (ligne), plage prudent–stress (aire) et récolte observée (points), semaine par semaine.
 * Survol ou flèches du clavier : le détail d'une semaine ; le même détail est lu par les lecteurs d'écran.
 */
export function ForecastChart({ weeks, title }: { weeks: WeekForecast[]; title: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const ticks = niceTicks(Math.max(0, ...weeks.map((w) => Math.max(w.stress_t, w.central_t, w.actual_t))) * 1.08);
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(200, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const totalW = plotW + MARGIN.left + MARGIN.right;
  const band = plotW / Math.max(1, weeks.length);
  const x = (i: number) => MARGIN.left + band * (i + 0.5);
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;
  const labelEvery = Math.ceil(36 / band);
  // À côté du repère, jamais dessus (les points de la semaine restent visibles), sans sortir du graphique
  const tooltipLeft = (cx: number) => {
    const preferred = cx < totalW / 2 ? cx + TOOLTIP_OFFSET : cx - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
    return Math.max(0, Math.min(preferred, totalW - TOOLTIP_WIDTH));
  };

  const points = (key: "central_t" | "prudent_t" | "stress_t") => weeks.map((w, i) => `${x(i)},${y(w[key])}`);
  const line = `M${points("central_t").join(" L")}`;
  const area = `M${points("stress_t").join(" L")} L${points("prudent_t").reverse().join(" L")} Z`;

  const peak = weeks.reduce((best, w, i) => (w.central_t > weeks[best].central_t ? i : best), 0);
  const actualPeak = weeks.reduce((best, w, i) => (w.actual_t > weeks[best].actual_t ? i : best), 0);
  // Une zone change la série sans démonter le graphique : on ignore un index devenu hors limites
  const current = active !== null && active < weeks.length ? active : null;
  const shown = current === null ? null : weeks[current];

  const onKeyDown = (e: KeyboardEvent) => {
    const last = weeks.length - 1;
    const from = current ?? peak;
    const next: Record<string, number> = {
      ArrowRight: Math.min(last, from + 1),
      ArrowLeft: Math.max(0, from - 1),
      Home: 0,
      End: last,
    };
    if (e.key in next) {
      e.preventDefault();
      setActive(next[e.key]);
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  if (weeks.length === 0) {
    return (
      <div ref={ref} className="af-chart">
        <div className="af-empty">Aucune récolte observée ni prévue sur ce périmètre.</div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="af-chart"
      role="group"
      tabIndex={0}
      aria-label={`${title}. Flèches gauche et droite pour parcourir les semaines.`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((a) => a ?? peak)}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
    >
      <svg
        width={totalW}
        height={HEIGHT}
        role="img"
        aria-label={
          `${title} : pic prévu de ${formatTonnes(weeks[peak].central_t)} en semaine ${weeks[peak].week}, ` +
          `pic observé de ${formatTonnes(weeks[actualPeak].actual_t)} en semaine ${weeks[actualPeak].week}. ` +
          `Détail dans la vue tableau.`
        }
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

        <path d={area} className="af-chart__band" />

        {current !== null && (
          <line x1={x(current)} x2={x(current)} y1={MARGIN.top} y2={MARGIN.top + plotH} className="af-chart__crosshair" />
        )}

        <path d={line} className="af-chart__line" />

        {weeks.map((w, i) =>
          w.actual_t > 0 ? <circle key={w.week} cx={x(i)} cy={y(w.actual_t)} r={4} className="af-chart__dot" /> : null,
        )}

        {current !== null && <circle cx={x(current)} cy={y(weeks[current].central_t)} r={4} className="af-chart__marker" />}

        <text
          x={x(peak)}
          y={y(Math.max(weeks[peak].stress_t, weeks[peak].actual_t)) - 10}
          className="af-chart__label"
          textAnchor="middle"
        >
          Pic prévu · {formatTonnes(weeks[peak].central_t)}
        </text>

        {weeks.map((w, i) =>
          i % labelEvery === 0 ? (
            <text key={w.week} x={x(i)} y={HEIGHT - MARGIN.bottom + 18} className="af-chart__tick" textAnchor="middle">
              S{w.week}
            </text>
          ) : null,
        )}

        {/* Zones de survol : toute la hauteur de la semaine, bien plus large que les marques */}
        {weeks.map((w, i) => (
          <rect
            key={w.week}
            x={MARGIN.left + band * i}
            y={MARGIN.top}
            width={band}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(i)}
          />
        ))}
      </svg>

      {shown && current !== null && (
        <div
          className="af-chart__tooltip"
          aria-hidden="true"
          style={{ left: tooltipLeft(x(current)), top: MARGIN.top, width: TOOLTIP_WIDTH, transform: "none" }}
        >
          <div className="af-chart__tooltip-title">Semaine {shown.week}</div>
          <dl>
            <dt>Récolte observée</dt>
            <dd>{formatTonnes(shown.actual_t, 1)}</dd>
            <dt>Prévision centrale</dt>
            <dd>{formatTonnes(shown.central_t, 1)}</dd>
            <dt>Prudent (Q75)</dt>
            <dd>{formatTonnes(shown.prudent_t, 1)}</dd>
            <dt>Stress (Q90)</dt>
            <dd>{formatTonnes(shown.stress_t, 1)}</dd>
          </dl>
          {shown.actual_t > shown.stress_t && <div className="af-chart__tooltip-note">Récolte au-delà du niveau stress</div>}
        </div>
      )}

      {/* Toujours présente pour être annoncée à chaque changement de semaine */}
      <div className="af-sr-only" role="status">
        {shown ? describeWeek(shown) : ""}
      </div>
    </div>
  );
}

/** Légende : toujours présente, l'identité d'une série ne repose jamais sur la seule couleur. */
export function ForecastChartLegend() {
  return (
    <div className="af-chart-legend">
      <span><i className="af-chart-legend__dot" />Récolte observée</span>
      <span><i className="af-chart-legend__stroke" />Prévision centrale</span>
      <span><i className="af-chart-legend__area" />Plage prudent – stress (quantiles 75 et 90 %)</span>
    </div>
  );
}
