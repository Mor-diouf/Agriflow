import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock3,
  Download,
  FileBarChart,
  FileText,
  Search,
  SlidersHorizontal,
  Printer,
  BadgeCheck,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { EnterpriseShell, Metric, Section } from "@/components/EnterpriseShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REPORTS } from "@/lib/operations-data";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Rapports & Certifications | SM10 Agro" },
      {
        name: "description",
        content:
          "Catalogue officiel des rapports d'analyses des modules SM10 (PuLP, K-Means, SARIMAX/Quantiles, Cockpit Décisionnel).",
      },
    ],
  }),
  component: Reports,
});

function Reports() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState(REPORTS[0]?.name ?? "");

  const rows = useMemo(
    () =>
      REPORTS.filter(
        (r) =>
          (type === "all" || r.type === type) &&
          r.name.toLowerCase().includes(query.toLowerCase())
      ),
    [query, type]
  );

  const current = REPORTS.find((r) => r.name === selected) ?? REPORTS[0]!;

  return (
    <EnterpriseShell
      active="reports"
      code="INTELLIGENCE / ANALYTICAL REPORTS"
      title="Rapports d'Analyse Certifiés"
      subtitle="Documentation officielle, protocoles expérimentaux et fiches de décision de la filière mangue."
      status="DOCUMENTATION SCIENTIFIQUE ACTIVE"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          className="text-xs gap-1.5"
        >
          <Printer className="size-3.5" />
          Imprimer le rapport
        </Button>
      }
    >
      <div className="ops-metric-grid">
        <Metric
          label="RAPPORTS CERTIFIÉS"
          value="5"
          detail="Modules 1, 2, 3 & 4 validés"
          tone="good"
        />
        <Metric
          label="OBSERVATIONS OOS M3"
          value="1 040"
          detail="Campagnes 2022 à 2025"
          tone="good"
        />
        <Metric
          label="PRODUCTEURS AUDITÉS"
          value="100"
          detail="Scoring K-Means (k=4)"
          tone="good"
        />
        <Metric
          label="DISTANCE SAUVÉE M1"
          value="−29,4%"
          detail="84 km économisés par rotation"
          tone="good"
        />
        <Metric
          label="DATE DE CERTIFICATION"
          value="24 SEP"
          detail="Version consolidée SM10"
        />
      </div>

      <div className="report-layout mt-4">
        {/* Colonne gauche : Bibliothèque des rapports */}
        <Section
          eyebrow="BIBLIOTHÈQUE SCIENTIFIQUE"
          title="Catalogue des Rapports SM10"
          aside={
            <div className="flex gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  className="w-56 pl-8 text-xs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer un rapport…"
                />
              </div>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-36 text-xs font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les modules</SelectItem>
                  {[...new Set(REPORTS.map((r) => r.type))].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        >
          <div className="report-list">
            {rows.map((r) => (
              <button
                type="button"
                key={r.name}
                className={`report-row text-left ${
                  selected === r.name ? "report-row-active" : ""
                }`}
                onClick={() => setSelected(r.name)}
              >
                <span className="report-icon">
                  <FileBarChart />
                </span>
                <span className="min-w-0">
                  <b className="truncate block">{r.name}</b>
                  <small>
                    {r.type} · {r.period}
                  </small>
                </span>
                <span className="hidden md:block">
                  <small>Entité responsable</small>
                  <b>{r.owner}</b>
                </span>
                <span>
                  <small>Statut</small>
                  <b className="text-emerald-400 flex items-center gap-1">
                    <BadgeCheck className="size-3" />
                    {r.status}
                  </b>
                </span>
              </button>
            ))}
          </div>
        </Section>

        {/* Colonne droite : Aperçu du rapport sélectionné */}
        <Section eyebrow="APERCU OFFICIEL" title="Fiche Synthétique">
          <div className="report-preview">
            <div className="report-paper space-y-4">
              <div className="flex items-start justify-between border-b border-border pb-3">
                <div>
                  <p className="font-display text-base font-semibold text-foreground">
                    {current.name}
                  </p>
                  <small className="text-muted-foreground font-mono">
                    Module : {current.type} · Cadre : {current.period}
                  </small>
                </div>
                <Badge variant="outline" className="text-primary border-primary font-mono text-[10px]">
                  OFFICIEL
                </Badge>
              </div>

              {/* Métriques adaptées au rapport */}
              {current.type === "Module 3" && (
                <div className="report-summary">
                  <span>
                    <small>MAE SARIMAX</small>
                    <b>2,77 t</b>
                  </span>
                  <span>
                    <small>BIAIS PICS Q0.75</small>
                    <b>−2,53 t</b>
                  </span>
                  <span>
                    <small>ENTRÉE S1 Q0.90</small>
                    <b>−0,28 t</b>
                  </span>
                </div>
              )}

              {current.type === "Module 1" && (
                <div className="report-summary">
                  <span>
                    <small>DISTANCE TOTALE</small>
                    <b>202 km</b>
                  </span>
                  <span>
                    <small>ÉCONOMIE BASELINE</small>
                    <b>−29,4 %</b>
                  </span>
                  <span>
                    <small>PERTES ÉVITÉES</small>
                    <b>2,17 t</b>
                  </span>
                </div>
              )}

              {current.type === "Module 2" && (
                <div className="report-summary">
                  <span>
                    <small>PRODUCTEURS</small>
                    <b>100</b>
                  </span>
                  <span>
                    <small>PROFIL A (STRAT.)</small>
                    <b>62 (62%)</b>
                  </span>
                  <span>
                    <small>SILHOUETTE (k=4)</small>
                    <b>0,71</b>
                  </span>
                </div>
              )}

              {current.type === "Module 4" && (
                <div className="report-summary">
                  <span>
                    <small>SCÉNARIOS</small>
                    <b>4 testés</b>
                  </span>
                  <span>
                    <small>SATURATION MAX</small>
                    <b>121,5 %</b>
                  </span>
                  <span>
                    <small>FLOTTE RÉSERVE</small>
                    <b>Camion-R3 (10t)</b>
                  </span>
                </div>
              )}

              <div className="text-xs text-muted-foreground leading-relaxed space-y-2 border-t pt-3">
                <p>
                  Ce document certifie les résultats mathématiques et opérationnels
                  obtenus dans le cadre du projet <strong>SM10 Agro (Casamance)</strong>.
                </p>
                <p>
                  Les données proviennent directement de l'exécution reproductible
                  des scripts Python du projet : optimisation sous contraintes PuLP,
                  clustering non supervisé K-Means avec matrice de régularité, et
                  moteur de prévision multi-niveaux SARIMAX avec calibration quantile
                  pour les hauts volumes.
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3 text-[10px] text-muted-foreground font-mono">
                <span>RÉF : SM10-AGRO-2026-VAL</span>
                <span className="text-emerald-400 font-semibold">VALIDÉ POUR DÉCISION</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button
                variant="outline"
                className="text-xs gap-1.5"
                onClick={() => window.print()}
              >
                <Printer className="size-3.5" />
                Imprimer
              </Button>
              <Button
                className="text-xs gap-1.5"
                onClick={() => window.print()}
              >
                <Download className="size-3.5" />
                Exporter PDF
              </Button>
            </div>
          </div>
        </Section>
      </div>

      <Section eyebrow="DISTRIBUTION HEBDOMADAIRE" title="Programmation & Gouvernance" className="mt-4">
        <div className="schedule-grid">
          <article className="schedule-item">
            <CheckCircle2 className="size-5 text-emerald-400" />
            <div>
              <b>Synthèse Exécutive Direction</b>
              <p>Chaque lundi · 07:00 · Comité de Direction SM10</p>
            </div>
            <span>5 destinataires</span>
          </article>
          <article className="schedule-item">
            <Clock3 className="size-5 text-primary" />
            <div>
              <b>Plan Logistique & Tournées PuLP</b>
              <p>Chaque matin · 05:30 · Chauffeurs & Usine Bambali</p>
            </div>
            <span>Flotte active</span>
          </article>
          <article className="schedule-item">
            <TrendingUp className="size-5 text-amber-400" />
            <div>
              <b>Alerte Prévisionnelle & Pics de Récolte</b>
              <p>Hebdomadaire · Mercredi · Agronomie & Responsables de Zone</p>
            </div>
            <span>8 destinataires</span>
          </article>
        </div>
      </Section>
    </EnterpriseShell>
  );
}
