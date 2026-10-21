import type { PriorityTier, Producer, ProducerQuery, ProducerSummary } from "@agriflow/api-client";
import {
  Badge,
  Button,
  Card,
  KpiCard,
  Meter,
  Notice,
  PageHeader,
  SearchInput,
  Segmented,
  Skeleton,
  formatNumber,
  formatRatio,
  useDebouncedValue,
} from "@agriflow/ui";
import { useState } from "react";

import { ProducerDrawer } from "./ProducerDrawer";
import { usePlatformConfig, useProducerSummary, useProducers } from "./queries";
import { HIGH_REJECTION_RATE, TIERS, tierMeta } from "./tiers";

const PAGE_SIZE = 20;

type SortKey = NonNullable<ProducerQuery["sort"]>;
type TierFilter = PriorityTier | "all";

const COLUMNS: { key: SortKey; label: string; align?: "end"; defaultOrder: "asc" | "desc" }[] = [
  { key: "score", label: "Score", defaultOrder: "desc" },
  { key: "deliverable", label: "Volume livrable", align: "end", defaultOrder: "desc" },
  { key: "distance", label: "Distance usine", align: "end", defaultOrder: "asc" },
  { key: "reliability", label: "Fiabilité", align: "end", defaultOrder: "desc" },
];

export function ProducersPage({ onSendToRouting }: { onSendToRouting?: (producerIds: string[]) => void }) {
  const [tier, setTier] = useState<TierFilter>("all");
  const [sort, setSort] = useState<SortKey>("score");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Producer | null>(null);

  const debouncedSearch = useDebouncedValue(search.trim());
  const query: ProducerQuery = {
    tier: tier === "all" ? undefined : tier,
    search: debouncedSearch || undefined,
    sort,
    order,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const config = usePlatformConfig();
  const summary = useProducerSummary();
  const list = useProducers(query);

  const changeTier = (t: TierFilter) => {
    setTier(t);
    setPage(0);
  };
  const changeSearch = (v: string) => {
    setSearch(v);
    setPage(0);
  };
  const toggleSort = (key: SortKey, defaultOrder: "asc" | "desc") => {
    if (key === sort) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setOrder(defaultOrder);
    }
    setPage(0);
  };

  const failed = summary.isError || list.isError;
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="M2 · Intelligence producteurs"
        title="Producteurs"
        actions={
          onSendToRouting && (
            <Button
              disabled={!list.data}
              onClick={() => onSendToRouting(list.data?.items.map((p) => p.id) ?? [])}
            >
              Envoyer aux tournées
            </Button>
          )
        }
      />

      {config.data?.data_status === "simulated" && (
        <Notice>
          <strong>Données simulées</strong> — producteurs générés par copule gaussienne, en attendant les données
          réelles SM10.
        </Notice>
      )}

      {failed && (
        <Notice tone="danger">
          Impossible de joindre l'API SM10. Vérifiez qu'elle est lancée (<code>services/api</code>).{" "}
          <Button
            variant="ghost"
            onClick={() => {
              summary.refetch();
              list.refetch();
            }}
          >
            Réessayer
          </Button>
        </Notice>
      )}

      <SummaryKpis summary={summary.data} loading={summary.isPending && !summary.isError} />
      <TierBreakdown summary={summary.data} />

      <Card>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "16px 24px",
            borderBottom: "1px solid var(--af-border)",
          }}
        >
          <Segmented<TierFilter>
            label="Filtrer par niveau"
            value={tier}
            onChange={changeTier}
            options={[
              { value: "all", label: `Tous${summary.data ? ` · ${summary.data.total}` : ""}` },
              ...TIERS.map((t) => {
                const count = summary.data?.tiers.find((s) => s.tier === t.value)?.count;
                return { value: t.value, label: `${t.label}${count !== undefined ? ` · ${count}` : ""}` };
              }),
            ]}
          />
          <SearchInput label="Rechercher un producteur" placeholder="Identifiant, ex. P034" value={search} onChange={changeSearch} />
        </div>

        <div className="af-table-scroll">
          <table className="af-table" aria-busy={list.isFetching}>
            <caption className="af-sr-only">Liste des producteurs, triée par {COLUMNS.find((c) => c.key === sort)?.label}</caption>
            <thead>
              <tr>
                <th scope="col">Producteur</th>
                <th scope="col">Niveau</th>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={c.align === "end" ? "af-align-end" : undefined}
                    aria-sort={sort === c.key ? (order === "asc" ? "ascending" : "descending") : "none"}
                  >
                    <button type="button" className="af-sort" onClick={() => toggleSort(c.key, c.defaultOrder)}>
                      {c.label}
                      <span aria-hidden="true">{sort === c.key ? (order === "asc" ? "↑" : "↓") : ""}</span>
                    </button>
                  </th>
                ))}
                <th scope="col" className="af-align-end">Taux de rejet</th>
              </tr>
            </thead>
            <tbody>
              {list.data
                ? list.data.items.map((p) => <ProducerRow key={p.id} producer={p} onOpen={() => setSelected(p)} />)
                : !list.isError && Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
          {list.data && total === 0 && (
            <div className="af-empty">
              Aucun producteur ne correspond à « {debouncedSearch} ».
              <Button variant="secondary" onClick={() => changeSearch("")}>Effacer la recherche</Button>
            </div>
          )}
        </div>

        {list.data && total > 0 && (
          <div className="af-pager">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} sur {total} producteurs
            </span>
            <div className="af-pager__actions">
              <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Précédent
              </Button>
              <Button variant="secondary" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>

      <ProducerDrawer producer={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SummaryKpis({ summary, loading }: { summary?: ProducerSummary; loading: boolean }) {
  const top = summary?.tiers.find((t) => t.tier === "prioritaire");
  const meanScore = summary
    ? summary.tiers.reduce((acc, t) => acc + t.mean_score * t.count, 0) / summary.total
    : 0;

  return (
    <div className="af-kpi-grid" role="group" aria-label="Indicateurs clés">
      <KpiCard label="Producteurs" loading={loading} value={summary ? formatNumber(summary.total) : ""} detail="5 zones de Casamance" />
      <KpiCard
        label="Volume livrable"
        loading={loading}
        value={summary ? formatNumber(summary.deliverable_t, 1) : ""}
        unit="t"
        detail="Fiabilité × production"
      />
      <KpiCard
        label="Prioritaires"
        loading={loading}
        value={top ? formatNumber(top.count) : ""}
        detail={top && summary ? `${formatRatio(top.deliverable_t / summary.deliverable_t, 1)} % du volume livrable` : undefined}
        detailTone="positive"
      />
      <KpiCard
        label="Score moyen"
        loading={loading}
        value={summary ? formatRatio(meanScore) : ""}
        unit="/ 100"
        detail="Poids égaux · scénario Base"
      />
    </div>
  );
}

function TierBreakdown({ summary }: { summary?: ProducerSummary }) {
  if (!summary) return null;
  const description = summary.tiers
    .map((t) => `${tierMeta(t.tier).label} ${formatNumber(t.deliverable_t, 1)} t`)
    .join(", ");

  return (
    <Card padded style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="af-card__header">
        <h2 className="af-card__title">Volume livrable par niveau de priorité</h2>
        <span style={{ fontSize: 13, color: "var(--af-muted)" }}>Classement par rang du score : 20{" "}% · 40{" "}% · 40{" "}%</span>
      </div>
      <div className="af-stack-bar" role="img" aria-label={description}>
        {summary.tiers.map((t) => (
          <div key={t.tier} style={{ flex: `${t.deliverable_t} 1 0`, background: tierMeta(t.tier).color }} />
        ))}
      </div>
      <div className="af-legend">
        {summary.tiers.map((t) => (
          <div key={t.tier} className="af-legend__item">
            <span className="af-legend__swatch" style={{ background: tierMeta(t.tier).color }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {tierMeta(t.tier).label} · {t.count}
              </div>
              <div className="af-num" style={{ fontSize: 13, color: "var(--af-muted)" }}>
                {formatNumber(t.deliverable_t, 1)} t · score {formatRatio(t.mean_score)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProducerRow({ producer: p, onOpen }: { producer: Producer; onOpen: () => void }) {
  const tier = tierMeta(p.tier);
  const highReject = p.rejection_rate > HIGH_REJECTION_RATE;

  return (
    <tr>
      <td>
        <button type="button" className="af-row-button" onClick={onOpen} aria-label={`Ouvrir la fiche de ${p.id}`}>
          {p.id}
        </button>
      </td>
      <td>
        <Badge tone={tier.tone}>{tier.label}</Badge>
      </td>
      <td>
        <Meter value={p.score} max={1}>
          <span className="af-num">{formatRatio(p.score)}</span>
        </Meter>
      </td>
      <td className="af-align-end af-num">{formatNumber(p.deliverable_t, 1)} t</td>
      <td className="af-align-end af-num">{formatNumber(p.distance_km)} km</td>
      <td className="af-align-end af-num">{formatRatio(p.reliability)} %</td>
      <td className="af-align-end">
        {highReject ? (
          <span className="af-badge af-badge--danger af-num" title="Taux de rejet supérieur à 15 %">
            {formatRatio(p.rejection_rate, 1)} %
          </span>
        ) : (
          <span className="af-num">{formatRatio(p.rejection_rate, 1)} %</span>
        )}
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }, (_, i) => (
        <td key={i}>
          <Skeleton width={i === 1 ? 90 : 60} />
        </td>
      ))}
    </tr>
  );
}
