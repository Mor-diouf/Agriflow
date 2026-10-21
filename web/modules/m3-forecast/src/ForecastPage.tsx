import type { ModelBenchmark } from "@agriflow/api-client";
import {
  Badge,
  Button,
  Card,
  KpiCard,
  Notice,
  PageHeader,
  Segmented,
  Skeleton,
  formatNumber,
  formatPercent,
  formatSigned,
  formatTonnes,
  type Tone,
} from "@agriflow/ui";
import { useState } from "react";

import { ForecastChart, ForecastChartLegend } from "./ForecastChart";
import { BASELINE_MODEL, calibration, levelMeta, type Calibration } from "./levels";
import { useModelBenchmark, usePlatformConfig, useSeasonForecast } from "./queries";
import { seasonStats, seasonWindow, weeklySeries, type SeasonStats, type WeekForecast } from "./series";

const ALL_ZONES = "all";

type View = "chart" | "table";
type BenchmarkScope = "harvest_weeks" | "all_weeks";

export function ForecastPage() {
  const [year, setYear] = useState<number | null>(null);
  const [zone, setZone] = useState(ALL_ZONES);
  const [view, setView] = useState<View>("chart");

  const config = usePlatformConfig();
  const seasons = config.data?.forecast_seasons ?? [];
  const zones = config.data?.zones ?? [];
  // Par défaut, la saison la plus récente
  const season = year ?? seasons[seasons.length - 1];
  const forecast = useSeasonForecast(season);
  const benchmark = useModelBenchmark();

  // Pendant le chargement d'une autre saison, la précédente reste affichée : les libellés suivent les données
  const points = forecast.data;
  const shownSeason = points?.[0]?.year ?? season;
  const zoneFilter = zone === ALL_ZONES ? null : zone;
  const weeks = points ? weeklySeries(points, zoneFilter) : undefined;
  const stats = weeks ? seasonStats(weeks) : null;
  const scopeLabel = zoneFilter ?? "Toutes zones";

  const failed = config.isError || forecast.isError || benchmark.isError;

  return (
    <>
      <PageHeader eyebrow="M3 · Prévision des récoltes" title="Prévisions de récolte" />

      {config.data?.data_status === "simulated" && (
        <Notice>
          <strong>Données simulées</strong> — récoltes hebdomadaires simulées par zone, en attendant les données
          réelles SM10.
        </Notice>
      )}

      {failed && (
        <Notice tone="danger">
          Impossible de joindre l'API SM10. Vérifiez qu'elle est lancée (<code>services/api</code>).{" "}
          <Button
            variant="ghost"
            onClick={() => {
              config.refetch();
              forecast.refetch();
              benchmark.refetch();
            }}
          >
            Réessayer
          </Button>
        </Notice>
      )}

      <Card padded className="af-filters" aria-label="Périmètre affiché">
        <div className="af-field">
          <span className="af-field__label">Saison</span>
          {seasons.length > 0 ? (
            <Segmented<string>
              label="Saison"
              value={String(season)}
              onChange={(y) => setYear(Number(y))}
              options={seasons.map((y) => ({ value: String(y), label: String(y) }))}
            />
          ) : (
            config.isPending && <Skeleton width={260} height={40} />
          )}
        </div>
        <div className="af-field">
          <span className="af-field__label">Zone</span>
          {zones.length > 0 ? (
            <Segmented<string>
              label="Zone"
              value={zone}
              onChange={setZone}
              options={[{ value: ALL_ZONES, label: "Toutes" }, ...zones.map((z) => ({ value: z, label: z }))]}
            />
          ) : (
            config.isPending && <Skeleton width={420} height={40} />
          )}
        </div>
      </Card>

      <SeasonKpis stats={stats} loading={!failed && !stats} />

      <Card>
        <div className="af-card__toolbar">
          <div className="af-card__heading">
            <h2 className="af-card__title">
              Récolte hebdomadaire · {scopeLabel}
              {shownSeason !== undefined && ` · ${shownSeason}`}
            </h2>
            <p className="af-card__subtitle">
              Prévision à une semaine, hors échantillon : chaque semaine est prévue avec les récoltes connues jusqu'à
              la semaine précédente, par un modèle qui n'a pas vu la saison.
            </p>
          </div>
          <Segmented<View>
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Graphique" },
              { value: "table", label: "Tableau" },
            ]}
          />
        </div>

        {weeks && stats && shownSeason !== undefined ? (
          <div className="af-card__body" aria-busy={forecast.isFetching}>
            <p className="af-verdict">
              <span>
                En {shownSeason}, {zoneFilter ? `dans la zone de ${zoneFilter}` : "sur l'ensemble des zones"}, la
                prévision centrale annonçait <strong>{formatTonnes(stats.forecast_t)}</strong> ;{" "}
                <strong>{formatTonnes(stats.actual_t)}</strong> ont été récoltées (écart{" "}
                {formatSigned(stats.gap * 100, 1, "%")}).
              </span>
            </p>
            {view === "chart" ? (
              <>
                <ForecastChart weeks={seasonWindow(weeks)} title={`Récolte hebdomadaire, ${scopeLabel}, saison ${shownSeason}`} />
                <ForecastChartLegend />
              </>
            ) : (
              <WeeksTable weeks={seasonWindow(weeks)} />
            )}
            {zoneFilter === null && (
              <p className="af-note">
                Toutes zones : prévisions additionnées zone par zone, comme dans la Charge usine. Additionner des
                quantiles suppose que les zones varient ensemble : les niveaux prudent et stress du total sont donc un
                peu larges.
              </p>
            )}
          </div>
        ) : (
          !failed && <div className="af-empty">Chargement des prévisions…</div>
        )}
      </Card>

      {points && shownSeason !== undefined && (
        <Card>
          <div className="af-card__toolbar">
            <div className="af-card__heading">
              <h2 className="af-card__title">Par zone · {shownSeason}</h2>
              <p className="af-card__subtitle">Choisissez une zone pour l'afficher dans le graphique.</p>
            </div>
          </div>
          <ZoneTable
            rows={zones.map((z) => ({ zone: z, stats: seasonStats(weeklySeries(points, z)) }))}
            total={seasonStats(weeklySeries(points, null))}
            selected={zone}
            onSelect={setZone}
          />
        </Card>
      )}

      <ModelBenchmarkCard models={benchmark.data} seasons={seasons} zoneCount={zones.length} />
    </>
  );
}

function SeasonKpis({ stats, loading }: { stats: SeasonStats | null; loading: boolean }) {
  return (
    <div className="af-kpi-grid" role="group" aria-label="Indicateurs de la saison">
      <KpiCard
        label="Récolte prévue"
        loading={loading}
        value={stats ? formatNumber(stats.forecast_t) : ""}
        unit="t"
        detail={stats && `Observée : ${formatTonnes(stats.actual_t)} · écart ${formatSigned(stats.gap * 100, 1, "%")}`}
      />
      <KpiCard
        label="Pic prévu"
        loading={loading}
        value={stats ? formatNumber(stats.peak.central_t) : ""}
        unit="t"
        detail={
          stats &&
          `Semaine ${stats.peak.week} · pic observé en semaine ${stats.actualPeak.week} (${formatTonnes(stats.actualPeak.actual_t)})`
        }
      />
      <KpiCard
        label="Erreur moyenne"
        loading={loading}
        value={stats ? formatNumber(stats.mae_t, 1) : ""}
        unit="t / semaine"
        detail={stats && `${formatPercent(stats.wape)} de la récolte · ${stats.harvestWeeks} semaines de récolte`}
      />
      <KpiCard
        label="Prudent non dépassé"
        loading={loading}
        value={stats ? formatNumber(stats.prudentCoverage * 100) : ""}
        unit="% des semaines"
        detail={stats && `Cible 75 % · stress non dépassé : ${formatPercent(stats.stressCoverage)} (cible 90 %)`}
      />
    </div>
  );
}

function WeeksTable({ weeks }: { weeks: WeekForecast[] }) {
  return (
    <div className="af-table-scroll">
      <table className="af-table">
        <caption className="af-sr-only">Récolte observée et prévisions, semaine par semaine</caption>
        <thead>
          <tr>
            <th scope="col">Semaine</th>
            <th scope="col" className="af-align-end">Récolte observée</th>
            <th scope="col" className="af-align-end">Prévision centrale</th>
            <th scope="col" className="af-align-end">Écart</th>
            <th scope="col" className="af-align-end">Prudent (Q75)</th>
            <th scope="col" className="af-align-end">Stress (Q90)</th>
            <th scope="col">Dépassement</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td className="af-num">S{w.week}</td>
              <td className="af-align-end af-num">{formatTonnes(w.actual_t, 1)}</td>
              <td className="af-align-end af-num">{formatTonnes(w.central_t, 1)}</td>
              <td className="af-align-end af-num">{formatSigned(w.central_t - w.actual_t, 1, "t")}</td>
              <td className="af-align-end af-num">{formatTonnes(w.prudent_t, 1)}</td>
              <td className="af-align-end af-num">{formatTonnes(w.stress_t, 1)}</td>
              <td>
                {w.actual_t > w.stress_t ? (
                  <Badge tone="danger">Stress dépassé</Badge>
                ) : w.actual_t > w.prudent_t ? (
                  <Badge tone="mango">Prudent dépassé</Badge>
                ) : (
                  <span className="af-note">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ZoneTable({
  rows,
  total,
  selected,
  onSelect,
}: {
  rows: { zone: string; stats: SeasonStats | null }[];
  total: SeasonStats | null;
  selected: string;
  onSelect: (zone: string) => void;
}) {
  return (
    <div className="af-table-scroll">
      <table className="af-table">
        <caption className="af-sr-only">Prévision et précision par zone pour la saison</caption>
        <thead>
          <tr>
            <th scope="col">Zone</th>
            <th scope="col" className="af-align-end">Récolte prévue</th>
            <th scope="col" className="af-align-end">Récolte observée</th>
            <th scope="col" className="af-align-end">Écart</th>
            <th scope="col" className="af-align-end">Erreur moyenne</th>
            <th scope="col" className="af-align-end">Prudent non dépassé</th>
            <th scope="col" className="af-align-end">Pic prévu</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ZoneRow key={r.zone} label={r.zone} stats={r.stats} current={selected === r.zone} onSelect={() => onSelect(r.zone)} />
          ))}
        </tbody>
        <tfoot>
          <ZoneRow label="Toutes zones" stats={total} current={selected === ALL_ZONES} onSelect={() => onSelect(ALL_ZONES)} />
        </tfoot>
      </table>
    </div>
  );
}

function ZoneRow({
  label,
  stats,
  current,
  onSelect,
}: {
  label: string;
  stats: SeasonStats | null;
  current: boolean;
  onSelect: () => void;
}) {
  return (
    <tr aria-current={current || undefined}>
      <td>
        <button type="button" className="af-row-button af-row-button--text" onClick={onSelect} aria-label={`Afficher ${label}`}>
          {label}
        </button>
      </td>
      {stats ? (
        <>
          <td className="af-align-end af-num">{formatTonnes(stats.forecast_t)}</td>
          <td className="af-align-end af-num">{formatTonnes(stats.actual_t)}</td>
          <td className="af-align-end af-num">{formatSigned(stats.gap * 100, 1, "%")}</td>
          <td className="af-align-end af-num">{formatTonnes(stats.mae_t, 1)}</td>
          <td className="af-align-end af-num">{formatPercent(stats.prudentCoverage)}</td>
          <td className="af-align-end af-num">
            S{stats.peak.week} · {formatTonnes(stats.peak.central_t)}
          </td>
        </>
      ) : (
        <td colSpan={6} className="af-note">Pas de récolte observée cette saison</td>
      )}
    </tr>
  );
}

const CALIBRATION: Record<Calibration, { tone: Tone; label: string; detail: string }> = {
  calibrated: { tone: "forest", label: "Calibré", detail: "" },
  too_low: { tone: "mango", label: "Un peu juste", detail: " Il sous-estime les plus fortes semaines." },
  too_wide: { tone: "slate", label: "Trop large", detail: " Il est plus large que nécessaire." },
};

const modelLabel = (model: string) => (model === BASELINE_MODEL ? "Persistance" : model);

function ModelBenchmarkCard({ models, seasons, zoneCount }: { models?: ModelBenchmark[]; seasons: number[]; zoneCount: number }) {
  const [scope, setScope] = useState<BenchmarkScope>("harvest_weeks");
  const central = models?.find((m) => m.level === "central");
  const baseline = models?.find((m) => m.model === BASELINE_MODEL);
  const quantileModels = models?.filter((m) => m.level && levelMeta(m.level).quantile) ?? [];

  return (
    <Card>
      <div className="af-card__toolbar">
        <div className="af-card__heading">
          <h2 className="af-card__title">Fiabilité des modèles</h2>
          <p className="af-card__subtitle">
            Toutes saisons et zones confondues
            {seasons.length > 0 && ` (${seasons[0]} à ${seasons[seasons.length - 1]}, ${zoneCount} zones)`}
            {central && ` · ${formatNumber(central[scope].weeks)} semaines × zones évaluées`}
          </p>
        </div>
        <Segmented<BenchmarkScope>
          label="Semaines évaluées"
          value={scope}
          onChange={setScope}
          options={[
            { value: "harvest_weeks", label: "Semaines de récolte" },
            { value: "all_weeks", label: "Toutes les semaines" },
          ]}
        />
      </div>

      {models ? (
        <>
          <div className="af-card__body">
            {scope === "harvest_weeks" ? (
              <ul className="af-verdict-list">
                {central && baseline && <BaselineLine central={central} baseline={baseline} />}
                {quantileModels.map((m) => (
                  <CalibrationLine key={m.model} model={m} />
                ))}
              </ul>
            ) : (
              <Notice>
                Les semaines hors saison (0 t récoltée, presque 0 t prévue) comptent ici comme des prévisions
                parfaites : elles réduisent l'erreur et gonflent la couverture. Cette vue sert à comparer avec les
                rapports du M3, pas à juger les modèles.
              </Notice>
            )}
          </div>
          <BenchmarkTable models={models} scope={scope} />
        </>
      ) : (
        <div className="af-empty">Chargement des performances…</div>
      )}
    </Card>
  );
}

function BaselineLine({ central, baseline }: { central: ModelBenchmark; baseline: ModelBenchmark }) {
  const gain = 1 - central.harvest_weeks.mae / baseline.harvest_weeks.mae;
  return (
    <li>
      <Badge tone={gain > 0 ? "forest" : "danger"}>{gain > 0 ? "Plus précis" : "Moins précis"}</Badge>
      <span>
        <strong>Prévision centrale</strong> : erreur moyenne de {formatTonnes(central.harvest_weeks.mae, 1)} par zone
        et par semaine de récolte, soit {formatPercent(Math.abs(gain))} {gain > 0 ? "de moins" : "de plus"} que la
        persistance ({formatTonnes(baseline.harvest_weeks.mae, 1)}), qui reprend la récolte de la semaine précédente.
      </span>
    </li>
  );
}

function CalibrationLine({ model }: { model: ModelBenchmark }) {
  const meta = levelMeta(model.level!);
  const quantile = meta.quantile!;
  const metrics = model.harvest_weeks;
  const status = CALIBRATION[calibration(metrics.coverage_pct, quantile, metrics.weeks)];
  return (
    <li>
      <Badge tone={status.tone}>{status.label}</Badge>
      <span>
        <strong>
          Niveau {meta.label.toLowerCase()} (quantile {formatPercent(quantile)})
        </strong>{" "}
        : la récolte l'a dépassé {formatNumber(100 - metrics.coverage_pct)} % des semaines de récolte, pour{" "}
        {formatPercent(1 - quantile)} attendus.{status.detail}
      </span>
    </li>
  );
}

function BenchmarkTable({ models, scope }: { models: ModelBenchmark[]; scope: BenchmarkScope }) {
  return (
    <div className="af-table-scroll">
      <table className="af-table">
        <caption className="af-sr-only">
          Performance de chaque modèle testé, {scope === "harvest_weeks" ? "sur les semaines de récolte" : "sur toutes les semaines"}
        </caption>
        <thead>
          <tr>
            <th scope="col">Modèle</th>
            <th scope="col">Rôle</th>
            <th scope="col" className="af-align-end">Erreur moyenne</th>
            <th scope="col" className="af-align-end">RMSE</th>
            <th scope="col" className="af-align-end">Biais</th>
            <th scope="col" className="af-align-end">Couverture</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const metrics = m[scope];
            const meta = m.level ? levelMeta(m.level) : undefined;
            return (
              <tr key={m.model}>
                <td>{modelLabel(m.model)}</td>
                <td>
                  {meta ? (
                    <Badge tone={meta.value === "central" ? "forest" : "slate"}>{meta.label}</Badge>
                  ) : (
                    <span className="af-note">{m.model === BASELINE_MODEL ? "Référence naïve" : "Non retenu"}</span>
                  )}
                </td>
                <td className="af-align-end af-num">{formatTonnes(metrics.mae, 2)}</td>
                <td className="af-align-end af-num">{formatTonnes(metrics.rmse, 2)}</td>
                <td className="af-align-end af-num">{formatSigned(metrics.bias, 2, "t")}</td>
                <td className="af-align-end af-num">
                  {formatNumber(metrics.coverage_pct, 1)} %
                  {meta?.quantile !== undefined && <span className="af-note"> · cible {formatPercent(meta.quantile)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
