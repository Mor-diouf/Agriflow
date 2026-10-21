import type { CapacityScenario, ForecastLevel, WeeklyLoad } from "@agriflow/api-client";
import {
  Badge,
  Button,
  Card,
  KpiCard,
  Notice,
  PageHeader,
  RangeField,
  Segmented,
  formatNumber,
  formatRatio,
  useDebouncedValue,
} from "@agriflow/ui";
import { useState } from "react";

import { LoadChart, LoadChartLegend, activeWeeks } from "./LoadChart";
import { LEVELS, SEASONAL_CAPACITY_FACTOR, SEASONAL_WORKING_DAYS, REFERENCE_WORKING_DAYS, levelMeta } from "./levels";
import { useCapacityScenario, usePlatformConfig, useSeasonCapacityScenario } from "./queries";

type View = "chart" | "table";
type CapacityPreset = "reference" | "seasonal" | "custom";

export function CapacityPage() {
  const [level, setLevel] = useState<ForecastLevel>("central");
  const [year, setYear] = useState<number | null>(null);
  const [volumeFactor, setVolumeFactor] = useState(1);
  const [capacityFactor, setCapacityFactor] = useState(1);
  const [view, setView] = useState<View>("chart");

  // Les curseurs n'interrogent l'API qu'une fois immobiles
  const levers = useDebouncedValue({ volume_factor: volumeFactor, capacity_factor: capacityFactor }, 250);

  const config = usePlatformConfig();
  const allSeasons = useCapacityScenario({ level, ...levers });
  const years = [...new Set(allSeasons.data?.weeks.map((w) => w.year))].sort();
  // Par défaut, la saison la plus récente
  const season = year ?? years[years.length - 1];
  const seasonScenario = useSeasonCapacityScenario({ level, ...levers }, season);

  const failed = allSeasons.isError || seasonScenario.isError;
  const isDefault = level === "central" && volumeFactor === 1 && capacityFactor === 1;
  const baseCapacityPerDay = config.data?.factory_capacity_t_per_day;
  const preset: CapacityPreset =
    capacityFactor === 1 ? "reference" : capacityFactor === SEASONAL_CAPACITY_FACTOR ? "seasonal" : "custom";

  const reset = () => {
    setLevel("central");
    setVolumeFactor(1);
    setCapacityFactor(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="M4 · Scénarios de charge"
        title="Charge usine"
        actions={
          !isDefault && (
            <Button variant="secondary" onClick={reset}>
              Revenir au scénario de référence
            </Button>
          )
        }
      />

      {config.data?.data_status === "simulated" && (
        <Notice>
          <strong>Données simulées</strong> — flux prévus par le M3 sur des récoltes simulées, en attendant les données
          réelles SM10.
        </Notice>
      )}

      {failed && (
        <Notice tone="danger">
          Impossible de joindre l'API SM10. Vérifiez qu'elle est lancée (<code>services/api</code>).{" "}
          <Button
            variant="ghost"
            onClick={() => {
              allSeasons.refetch();
              seasonScenario.refetch();
            }}
          >
            Réessayer
          </Button>
        </Notice>
      )}

      <Card padded className="af-levers" aria-label="Hypothèses du scénario">
        <div className="af-field">
          <span className="af-field__label">Prévision de récolte</span>
          <Segmented<ForecastLevel>
            label="Niveau de prévision"
            value={level}
            onChange={setLevel}
            options={LEVELS.map((l) => ({ value: l.value, label: l.label }))}
          />
          <span className="af-field__hint">{levelMeta(level).detail}</span>
        </div>

        <div className="af-field">
          <span className="af-field__label">Capacité de l'usine</span>
          <Segmented<CapacityPreset>
            label="Hypothèse de capacité"
            value={preset}
            onChange={(p) => setCapacityFactor(p === "seasonal" ? SEASONAL_CAPACITY_FACTOR : 1)}
            options={[
              { value: "reference", label: `${REFERENCE_WORKING_DAYS} j/an` },
              { value: "seasonal", label: `Saisonnière · ${SEASONAL_WORKING_DAYS} j/an` },
            ]}
          />
          <RangeField
            label="Ajuster la capacité"
            min={50}
            max={400}
            step={5}
            value={Math.round(capacityFactor * 100)}
            onChange={(v) => setCapacityFactor(v / 100)}
            valueText={
              baseCapacityPerDay
                ? `${formatNumber(baseCapacityPerDay * capacityFactor, 1)} t/j`
                : `${formatNumber(capacityFactor * 100)} %`
            }
          />
        </div>

        <div className="af-field">
          <span className="af-field__label">Volume récolté</span>
          <RangeField
            label="Variation du volume récolté"
            min={50}
            max={200}
            step={5}
            value={Math.round(volumeFactor * 100)}
            onChange={(v) => setVolumeFactor(v / 100)}
            valueText={`${volumeFactor >= 1 ? "+" : "−"}${formatNumber(Math.abs(volumeFactor - 1) * 100)} %`}
          />
          <span className="af-field__hint">Par rapport à la prévision : bonne année, extension des vergers…</span>
        </div>
      </Card>

      <SeasonKpis
        scenario={seasonScenario.data}
        overall={allSeasons.data}
        loading={seasonScenario.isPending && !failed}
      />

      <Card>
        <div className="af-card__toolbar">
          <Segmented<string>
            label="Saison"
            value={String(season ?? "")}
            onChange={(y) => setYear(Number(y))}
            options={years.map((y) => ({ value: String(y), label: `Saison ${y}` }))}
          />
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

        {seasonScenario.data && season !== undefined ? (
          <div className="af-card__body" aria-busy={seasonScenario.isFetching}>
            <Verdict scenario={seasonScenario.data} year={season} />
            {view === "chart" ? (
              <>
                <LoadChart weeks={seasonScenario.data.weeks} year={season} />
                <LoadChartLegend />
              </>
            ) : (
              <WeeksTable weeks={activeWeeks(seasonScenario.data.weeks)} />
            )}
          </div>
        ) : (
          !failed && <div className="af-empty">Calcul du scénario…</div>
        )}
      </Card>
    </>
  );
}

function SeasonKpis({ scenario, overall, loading }: { scenario?: CapacityScenario; overall?: CapacityScenario; loading: boolean }) {
  const s = scenario?.summary;
  const peakWeek = scenario?.weeks.find((w) => w.year === s?.peak_year && w.week === s?.peak_week);
  const capacityPerWeek = scenario?.weeks[0]?.capacity_t;

  return (
    <div className="af-kpi-grid" role="group" aria-label="Indicateurs de la saison">
      <KpiCard
        label="Semaines en surcharge"
        loading={loading}
        value={s ? formatNumber(s.weeks_over_capacity) : ""}
        unit={s ? `/ ${s.active_weeks} sem. actives` : undefined}
        detail={
          overall &&
          `Toutes saisons : ${overall.summary.weeks_over_capacity} / ${overall.summary.active_weeks}`
        }
        detailTone={s && s.weeks_over_capacity > 0 ? "danger" : "positive"}
      />
      <KpiCard
        label="Pic de charge"
        loading={loading}
        value={s ? formatRatio(s.peak_saturation) : ""}
        unit="%"
        detail={s && peakWeek && `Semaine ${s.peak_week} · ${formatNumber(peakWeek.inflow_t, 1)} t prévues`}
      />
      <KpiCard
        label="Excédent non traitable"
        loading={loading}
        value={s ? formatNumber(s.total_excess_t) : ""}
        unit="t"
        detail="À stocker, réorienter ou perdre"
        detailTone={s && s.total_excess_t > 0 ? "danger" : undefined}
      />
      <KpiCard
        label="Capacité retenue"
        loading={loading}
        value={capacityPerWeek ? formatNumber(capacityPerWeek / 7, 1) : ""}
        unit="t/j"
        detail={capacityPerWeek && `${formatNumber(capacityPerWeek, 1)} t/sem · charge moyenne ${formatRatio(s?.mean_active_saturation ?? 0)} %`}
      />
    </div>
  );
}

/** La conclusion en une phrase : ce qu'un responsable d'usine doit retenir du scénario. */
function Verdict({ scenario, year }: { scenario: CapacityScenario; year: number }) {
  const s = scenario.summary;
  if (s.active_weeks === 0) return null;
  return s.weeks_over_capacity > 0 ? (
    <p className="af-verdict af-verdict--danger">
      <Badge tone="danger">Saturée</Badge>
      {/* Une seule phrase dans le conteneur flex, sinon chaque morceau de texte reçoit l'écart des éléments */}
      <span>
        En {year}, l'usine dépasse sa capacité <strong>{s.weeks_over_capacity} semaines sur {s.active_weeks}</strong>
        {" "}: {formatNumber(s.total_excess_t)} t de mangues ne peuvent pas être traitées à temps.
      </span>
    </p>
  ) : (
    <p className="af-verdict">
      <Badge tone="forest">Absorbée</Badge>
      <span>
        En {year}, l'usine absorbe tout le flux prévu. Charge maximale :{" "}
        <strong>{formatRatio(s.peak_saturation)} %</strong> en semaine {s.peak_week}.
      </span>
    </p>
  );
}

function WeeksTable({ weeks }: { weeks: WeeklyLoad[] }) {
  return (
    <div className="af-table-scroll">
      <table className="af-table">
        <caption className="af-sr-only">Charge hebdomadaire de l'usine pendant la saison</caption>
        <thead>
          <tr>
            <th scope="col">Semaine</th>
            <th scope="col" className="af-align-end">Flux prévu</th>
            <th scope="col" className="af-align-end">Flux observé</th>
            <th scope="col" className="af-align-end">Capacité</th>
            <th scope="col" className="af-align-end">Charge</th>
            <th scope="col" className="af-align-end">Excédent</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.week}>
              <td className="af-num">S{w.week}</td>
              <td className="af-align-end af-num">{formatNumber(w.inflow_t, 1)} t</td>
              <td className="af-align-end af-num">{formatNumber(w.actual_t, 1)} t</td>
              <td className="af-align-end af-num">{formatNumber(w.capacity_t, 1)} t</td>
              <td className="af-align-end">
                {w.saturation > 1 ? (
                  <span className="af-badge af-badge--danger af-num">{formatRatio(w.saturation)} %</span>
                ) : (
                  <span className="af-num">{formatRatio(w.saturation)} %</span>
                )}
              </td>
              <td className="af-align-end af-num">{w.excess_t > 0 ? `${formatNumber(w.excess_t, 1)} t` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
