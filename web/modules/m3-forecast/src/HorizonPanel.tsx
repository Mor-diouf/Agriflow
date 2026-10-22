import { Badge, Card, formatNumber, formatPercent, formatTonnes, niceTicks, useElementWidth } from "@agriflow/ui";
import { useState } from "react";

import { usefulHorizon, weeksLabel, type HorizonSummary } from "./horizons";

const HEIGHT = 240;
const MARGIN = { top: 24, right: 16, bottom: 44, left: 48 };
const TOOLTIP_WIDTH = 210;

/** Jusqu'où la prévision vaut mieux que la moyenne des saisons passées, en graphique et en tableau. */
export function HorizonPanel({
  rows,
  selected,
  onSelect,
}: {
  rows: HorizonSummary[];
  selected: number;
  onSelect: (horizon: number) => void;
}) {
  const useful = usefulHorizon(rows);
  const climatology = rows[0]?.climatologyMae;
  const last = rows[rows.length - 1];

  return (
    <Card>
      <div className="af-card__toolbar">
        <div className="af-card__heading">
          <h2 className="af-card__title">Fiabilité selon l'anticipation</h2>
          <p className="af-card__subtitle">
            Erreur moyenne par zone et par semaine de récolte, toutes saisons et zones confondues. Choisissez un horizon
            pour l'afficher partout dans la page.
          </p>
        </div>
      </div>
      <div className="af-card__body">
        {climatology !== undefined && last && (
          <p className="af-verdict">
            {useful === null ? (
              <>
                <Badge tone="mango">Peu utile</Badge>
                <span>
                  À aucun horizon la prévision centrale ne fait mieux que la climatologie, la moyenne des saisons
                  passées ({formatTonnes(climatology, 1)}).
                </span>
              </>
            ) : (
              <>
                <Badge tone="forest">Utile {useful === last.horizon ? `à ${weeksLabel(useful)}` : `jusqu'à ${weeksLabel(useful)}`}</Badge>
                <span>
                  {useful === last.horizon
                    ? `À tous les horizons évalués (jusqu'à ${weeksLabel(useful)}), la prévision centrale fait mieux que la climatologie`
                    : `Jusqu'à ${weeksLabel(useful)} d'anticipation, la prévision centrale fait mieux que la climatologie`}
                  , la moyenne des saisons passées ({formatTonnes(climatology, 1)}) :{" "}
                  {gainText(rows, climatology, useful)}.
                  {useful < last.horizon && " Au-delà, autant se fier à la saison moyenne."}
                </span>
              </>
            )}
          </p>
        )}
        <HorizonChart rows={rows} selected={selected} onSelect={onSelect} />
        <div className="af-chart-legend">
          <span><i className="af-chart-legend__stroke" />Prévision centrale</span>
          <span><i className="af-chart-legend__line" />Climatologie (moyenne des saisons passées)</span>
        </div>
      </div>
      <HorizonTable rows={rows} selected={selected} onSelect={onSelect} />
    </Card>
  );
}

/** « 28 % d'erreur en moins à 1 semaine, 7 % à 8 semaines » : l'avantage fond avec l'anticipation. */
function gainText(rows: HorizonSummary[], climatology: number, useful: number) {
  const gain = (r: HorizonSummary) => formatPercent(1 - r.centralMae / climatology);
  const first = rows[0];
  const end = rows.find((r) => r.horizon === useful)!;
  const firstText = `${gain(first)} d'erreur en moins à ${weeksLabel(first.horizon)}`;
  return end === first ? firstText : `${firstText}, ${gain(end)} à ${weeksLabel(end.horizon)}`;
}

function HorizonChart({ rows, selected, onSelect }: { rows: HorizonSummary[]; selected: number; onSelect: (h: number) => void }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  // La persistance, hors d'échelle dès 2 semaines, reste dans le tableau : le graphique compare au vrai concurrent
  const values = rows.flatMap((r) => [r.centralMae, r.climatologyMae ?? 0]);
  const ticks = niceTicks(Math.max(0, ...values) * 1.1);
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(160, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const totalW = plotW + MARGIN.left + MARGIN.right;
  const band = plotW / Math.max(1, rows.length);
  const x = (i: number) => MARGIN.left + band * (i + 0.5);
  const y = (v: number) => MARGIN.top + plotH - (v / yMax) * plotH;
  const path = (pick: (r: HorizonSummary) => number | undefined) => {
    const points = rows.flatMap((r, i) => {
      const v = pick(r);
      return v === undefined ? [] : [`${x(i)},${y(v)}`];
    });
    return points.length > 0 ? `M${points.join(" L")}` : "";
  };

  const climatology = rows[0]?.climatologyMae;
  const shownIndex = hovered ?? rows.findIndex((r) => r.horizon === selected);
  const shown = rows[shownIndex];
  const tooltipLeft = (cx: number) =>
    Math.max(0, Math.min(cx < totalW / 2 ? cx + 16 : cx - 16 - TOOLTIP_WIDTH, totalW - TOOLTIP_WIDTH));

  if (rows.length === 0) return null;

  return (
    <div ref={ref} className="af-chart" onMouseLeave={() => setHovered(null)}>
      <svg
        width={totalW}
        height={HEIGHT}
        role="img"
        aria-label={
          `Erreur moyenne de la prévision centrale : ${formatTonnes(rows[0].centralMae, 1)} à ${weeksLabel(rows[0].horizon)}, ` +
          `${formatTonnes(rows[rows.length - 1].centralMae, 1)} à ${weeksLabel(rows[rows.length - 1].horizon)}` +
          (climatology !== undefined ? ` ; climatologie : ${formatTonnes(climatology, 1)}.` : ".") +
          " Détail dans le tableau qui suit."
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
        <text x={MARGIN.left - 8} y={MARGIN.top - 12} className="af-chart__tick" textAnchor="end">
          t
        </text>

        {shown && (
          <line x1={x(shownIndex)} x2={x(shownIndex)} y1={MARGIN.top} y2={MARGIN.top + plotH} className="af-chart__crosshair" />
        )}

        {climatology !== undefined && (
          <>
            <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(climatology)} y2={y(climatology)} className="af-chart__threshold" />
            <text x={MARGIN.left + plotW} y={y(climatology) - 8} className="af-chart__label" textAnchor="end">
              Climatologie {formatTonnes(climatology, 1)}
            </text>
          </>
        )}

        <path d={path((r) => r.centralMae)} className="af-chart__line" />
        {rows.map((r, i) => (
          <circle
            key={r.horizon}
            cx={x(i)}
            cy={y(r.centralMae)}
            r={r.horizon === selected ? 6 : 4}
            className="af-chart__marker"
          />
        ))}

        {rows.map((r, i) => (
          <text
            key={r.horizon}
            x={x(i)}
            y={HEIGHT - MARGIN.bottom + 18}
            className={r.horizon === selected ? "af-chart__label" : "af-chart__tick"}
            textAnchor="middle"
          >
            {r.horizon}
          </text>
        ))}
        <text x={MARGIN.left + plotW / 2} y={HEIGHT - 6} className="af-chart__tick" textAnchor="middle">
          Semaines d'anticipation
        </text>

        {rows.map((r, i) => (
          <rect
            key={r.horizon}
            x={MARGIN.left + band * i}
            y={MARGIN.top}
            width={band}
            height={plotH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHovered(i)}
            onClick={() => onSelect(r.horizon)}
          />
        ))}
      </svg>

      {hovered !== null && shown && (
        <div
          className="af-chart__tooltip"
          aria-hidden="true"
          style={{ left: tooltipLeft(x(hovered)), top: MARGIN.top, width: TOOLTIP_WIDTH, transform: "none" }}
        >
          <div className="af-chart__tooltip-title">À {weeksLabel(shown.horizon)}</div>
          <dl>
            <dt>Prévision centrale</dt>
            <dd>{formatTonnes(shown.centralMae, 1)}</dd>
            {shown.climatologyMae !== undefined && (
              <>
                <dt>Climatologie</dt>
                <dd>{formatTonnes(shown.climatologyMae, 1)}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}

function HorizonTable({ rows, selected, onSelect }: { rows: HorizonSummary[]; selected: number; onSelect: (h: number) => void }) {
  const pct = (v?: number) => (v === undefined ? "—" : `${formatNumber(v, 1)} %`);
  const tonnes = (v?: number) => (v === undefined ? "—" : formatTonnes(v, 1));
  return (
    <div className="af-table-scroll">
      <table className="af-table">
        <caption className="af-sr-only">Erreur moyenne et couverture des niveaux selon l'anticipation</caption>
        <thead>
          <tr>
            <th scope="col">Anticipation</th>
            <th scope="col" className="af-align-end">Prévision centrale</th>
            <th scope="col" className="af-align-end">Persistance</th>
            <th scope="col" className="af-align-end">Climatologie</th>
            <th scope="col" className="af-align-end">Prudent non dépassé</th>
            <th scope="col" className="af-align-end">Stress non dépassé</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.horizon} aria-current={r.horizon === selected || undefined}>
              <td>
                <button
                  type="button"
                  className="af-row-button af-row-button--text"
                  onClick={() => onSelect(r.horizon)}
                  aria-label={`Afficher les prévisions à ${weeksLabel(r.horizon)}`}
                >
                  {weeksLabel(r.horizon)}
                </button>
              </td>
              <td className="af-align-end af-num">{tonnes(r.centralMae)}</td>
              <td className="af-align-end af-num">{tonnes(r.persistenceMae)}</td>
              <td className="af-align-end af-num">{tonnes(r.climatologyMae)}</td>
              <td className="af-align-end af-num">{pct(r.prudentCoveragePct)}</td>
              <td className="af-align-end af-num">{pct(r.stressCoveragePct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
