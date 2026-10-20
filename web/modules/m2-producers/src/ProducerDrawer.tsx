import type { Producer } from "@agriflow/api-client";
import { Badge, Drawer, Notice, formatNumber, formatRatio } from "@agriflow/ui";

import { HIGH_REJECTION_RATE, tierMeta } from "./tiers";

export function ProducerDrawer({ producer, onClose }: { producer: Producer | null; onClose: () => void }) {
  const tier = producer ? tierMeta(producer.tier) : null;

  return (
    <Drawer open={producer !== null} onClose={onClose} eyebrow="Fiche producteur" title={producer?.id ?? ""}>
      {producer && tier && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Badge tone={tier.tone}>{tier.label}</Badge>
            <span className="af-num" style={{ fontSize: 14, color: "var(--af-muted)" }}>
              Score {formatRatio(producer.score)} / 100
            </span>
          </div>

          {producer.rejection_rate > HIGH_REJECTION_RATE && (
            <Notice>
              <strong>Taux de rejet élevé ({formatRatio(producer.rejection_rate, 1)} %).</strong> Le score logistique
              ne tient pas encore compte de la qualité des livraisons.
            </Notice>
          )}

          <dl className="af-facts">
            <dt>Volume livrable<small>Fiabilité × production</small></dt>
            <dd>{formatNumber(producer.deliverable_t, 1)} t</dd>
            <dt>Production potentielle</dt>
            <dd>{formatNumber(producer.production_t, 1)} t</dd>
            <dt>Surface du verger</dt>
            <dd>{formatNumber(producer.area_ha, 2)} ha</dd>
            <dt>Rendement</dt>
            <dd>{formatNumber(producer.yield_t_per_ha, 2)} t/ha</dd>
            <dt>Fiabilité<small>Part des engagements tenus</small></dt>
            <dd>{formatRatio(producer.reliability)} %</dd>
            <dt>Taux de rejet<small>Part de la livraison refusée</small></dt>
            <dd>{formatRatio(producer.rejection_rate, 1)} %</dd>
            <dt>Distance à l'usine</dt>
            <dd>{formatNumber(producer.distance_km)} km</dd>
          </dl>
        </>
      )}
    </Drawer>
  );
}
