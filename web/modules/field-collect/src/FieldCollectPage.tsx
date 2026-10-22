import type { FieldProducer, FieldProducerIn, HarvestRecord, HarvestRecordIn } from "@agriflow/api-client";
import { Badge, Button, Card, PageHeader, Segmented, formatNumber, formatPercent } from "@agriflow/ui";
import { useState } from "react";

import { HarvestForm } from "./HarvestForm";
import { ProducerForm } from "./ProducerForm";
import type { OutboxItem } from "./outbox";
import { useFieldProducers, useFieldZones, useRecentHarvests } from "./queries";
import { newId } from "./storage";
import { useOutbox } from "./useOutbox";

type Tab = "collecte" | "producteurs";
type PendingProducer = Extract<OutboxItem, { kind: "producer" }>;
type PendingHarvest = Extract<OutboxItem, { kind: "harvest" }>;

const formatKg = (kg: number) => `${formatNumber(kg)} kg`;
const formatDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

export function FieldCollectPage() {
  const outbox = useOutbox();
  const zones = useFieldZones();
  const producers = useFieldProducers();
  const harvests = useRecentHarvests();
  const [tab, setTab] = useState<Tab>("collecte");
  const [registering, setRegistering] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const pendingProducers = outbox.items.filter((i): i is PendingProducer => i.kind === "producer");
  const pendingHarvests = outbox.items.filter((i): i is PendingHarvest => i.kind === "harvest");
  const known = producers.data ?? [];
  // Les fiches pas encore envoyées sont utilisables tout de suite pour saisir une collecte
  const producerOptions = [
    ...pendingProducers
      .filter((p) => !known.some((k) => k.id === p.id))
      .map((p) => ({ id: p.id, label: `Nouveau · ${p.body.full_name} (${p.body.village})` })),
    ...known.map((p) => ({ id: p.id, label: `${p.code} · ${p.full_name} (${p.village})` })),
  ];
  const producerLabel = (id: string) => producerOptions.find((p) => p.id === id)?.label ?? "Producteur inconnu";

  const saveProducer = (body: FieldProducerIn) => {
    outbox.add({ kind: "producer", id: newId(), body, queuedAt: new Date().toISOString() });
    setRegistering(false);
    setConfirmation(`${body.full_name} est enregistré sur le téléphone. L'envoi se fait dès que le réseau le permet.`);
  };

  const saveHarvest = (body: HarvestRecordIn) => {
    outbox.add({ kind: "harvest", id: newId(), body, queuedAt: new Date().toISOString() });
    setConfirmation(`Collecte de ${formatKg(body.quantity_kg)} enregistrée sur le téléphone. L'envoi se fait dès que le réseau le permet.`);
  };

  return (
    <>
      <PageHeader eyebrow="Collecte terrain" title="Saisie terrain" />

      <SyncBar outbox={outbox} />

      <Segmented<Tab>
        label="Écran"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setConfirmation("");
        }}
        options={[
          { value: "collecte", label: "Nouvelle collecte" },
          { value: "producteurs", label: `Producteurs · ${producerOptions.length}` },
        ]}
      />

      {/* Toujours présente pour être annoncée ; masquée à l'écran quand elle est vide */}
      <p className={confirmation ? "af-note" : "af-sr-only"} role="status">
        {confirmation}
      </p>

      {tab === "collecte" ? (
        <>
          <Card padded>
            <HarvestForm producers={producerOptions} onSave={saveHarvest} />
          </Card>
          <Card>
            <div className="af-card__toolbar">
              <h2 className="af-card__title">Dernières collectes</h2>
            </div>
            <HarvestList pending={pendingHarvests} recorded={harvests.data ?? []} producerLabel={producerLabel} />
          </Card>
        </>
      ) : (
        <>
          {registering ? (
            <Card padded>
              <h2 className="af-card__title" style={{ marginBottom: 16 }}>
                Recenser un producteur
              </h2>
              <ProducerForm zones={zones.data ?? []} onSave={saveProducer} onCancel={() => setRegistering(false)} />
            </Card>
          ) : (
            <div>
              <Button onClick={() => setRegistering(true)}>Recenser un producteur</Button>
            </div>
          )}
          <Card>
            <div className="af-card__toolbar">
              <h2 className="af-card__title">Producteurs recensés</h2>
            </div>
            <ProducerList pending={pendingProducers.filter((p) => !known.some((k) => k.id === p.id))} recorded={known} />
          </Card>
        </>
      )}
    </>
  );
}

function SyncBar({ outbox }: { outbox: ReturnType<typeof useOutbox> }) {
  const waiting = outbox.items.length;
  const rejected = outbox.items.filter((i) => i.error).length;
  return (
    <Card padded aria-label="Envoi des saisies">
      <div className="af-form-actions" style={{ justifyContent: "space-between" }}>
        <p className="af-verdict">
          <Badge tone={outbox.online ? "forest" : "mango"}>{outbox.online ? "Réseau disponible" : "Hors réseau"}</Badge>
          <span>
            {waiting === 0
              ? "Toutes les saisies sont envoyées."
              : `${waiting} saisie${waiting > 1 ? "s" : ""} en attente d'envoi${rejected > 0 ? `, dont ${rejected} à corriger` : ""}.`}
            {outbox.lastSentAt && ` Dernier envoi à ${outbox.lastSentAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`}
          </span>
        </p>
        <Button variant="secondary" disabled={waiting === 0 || outbox.syncing} onClick={() => void outbox.sync()}>
          {outbox.syncing ? "Envoi…" : "Envoyer maintenant"}
        </Button>
      </div>
    </Card>
  );
}

function PendingBadge({ item }: { item: OutboxItem }) {
  return item.error ? <Badge tone="danger">À corriger : {item.error}</Badge> : <Badge tone="mango">En attente d'envoi</Badge>;
}

function ProducerList({ pending, recorded }: { pending: PendingProducer[]; recorded: FieldProducer[] }) {
  if (pending.length === 0 && recorded.length === 0) {
    return <div className="af-empty">Aucun producteur recensé pour l'instant.</div>;
  }
  return (
    <ul className="af-list">
      {pending.map((p) => (
        <li key={p.id} className="af-list__item">
          <div>
            <div className="af-list__title">{p.body.full_name}</div>
            <div className="af-list__meta">
              {p.body.village} · {p.body.zone}
            </div>
          </div>
          <PendingBadge item={p} />
        </li>
      ))}
      {recorded.map((p) => (
        <li key={p.id} className="af-list__item">
          <div>
            <div className="af-list__title">
              <span className="af-num">{p.code}</span> · {p.full_name}
            </div>
            <div className="af-list__meta">
              {p.village} · {p.zone}
            </div>
          </div>
          <div className="af-list__meta" style={{ textAlign: "right" }}>
            {p.harvest_count > 0 ? (
              <>
                {formatKg(p.harvested_kg)} en {p.harvest_count} collecte{p.harvest_count > 1 ? "s" : ""}
                {p.rejection_rate !== null && p.rejection_rate !== undefined && ` · rejet ${formatPercent(p.rejection_rate)}`}
              </>
            ) : (
              "Pas encore de collecte"
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function HarvestList({
  pending,
  recorded,
  producerLabel,
}: {
  pending: PendingHarvest[];
  recorded: HarvestRecord[];
  producerLabel: (id: string) => string;
}) {
  if (pending.length === 0 && recorded.length === 0) {
    return <div className="af-empty">Aucune collecte enregistrée pour l'instant.</div>;
  }
  return (
    <ul className="af-list">
      {pending.map((h) => (
        <li key={h.id} className="af-list__item">
          <div>
            <div className="af-list__title">{producerLabel(h.body.producer_id)}</div>
            <div className="af-list__meta">
              {formatDay(h.body.harvest_date)} · {formatKg(h.body.quantity_kg)}, dont {formatKg(h.body.rejected_kg ?? 0)} rejetés
            </div>
          </div>
          <PendingBadge item={h} />
        </li>
      ))}
      {recorded.map((h) => (
        <li key={h.id} className="af-list__item">
          <div>
            <div className="af-list__title">{producerLabel(h.producer_id)}</div>
            <div className="af-list__meta">
              {formatDay(h.harvest_date)} · {formatKg(h.quantity_kg)}, dont {formatKg(h.rejected_kg ?? 0)} rejetés
            </div>
          </div>
          <Badge tone="forest">Envoyée</Badge>
        </li>
      ))}
    </ul>
  );
}
