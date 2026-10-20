import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Bot, CalendarRange, CheckCircle2, CloudRain, Cpu, Database, Download, Factory, Info, MapPin, Minus, RotateCw, Route as RouteIcon, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { EnterpriseShell, Section } from "@/components/EnterpriseShell";
import { DataLabel, DataLegend } from "@/components/forecast/DataLabel";
import { ForecastChart, type ChartVariable } from "@/components/forecast/ForecastChart";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { BENCHMARK, CAPACITY, CURRENT_WEEK, DEMO_ZONES, INITIAL_CALC_LOG, MODEL, MODEL_VARIABLES, WEATHER, weekLabel } from "@/lib/forecast/demo-data";
import { capacityState, getDataQuality, getProducerSegments, getSeries, getZoneRows, type ZoneRow } from "@/lib/forecast/service";
import type { CalcLogEntry } from "@/lib/forecast/types";

export const Route = createFileRoute("/module3")({
  head: () => ({ meta: [
    { title: "Prévision des volumes de récolte | AgriFlow Module 03" },
    { name: "description", content: "Forecast Intelligence : volumes de mangues prévus par zone et par semaine, incertitude, capacité usine et planification de la collecte." },
    { property: "og:title", content: "Prévision des volumes de récolte | AgriFlow Module 03" },
    { property: "og:description", content: "Anticiper les volumes disponibles pour synchroniser collecte et capacité industrielle." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Module3,
});

const PERIODS = { "4": 4, "8": 8, "12": 12, all: 99 } as const;
type Period = keyof typeof PERIODS;
const fmt = (v: number, d = 1) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });

function Module3() {
  const navigate = useNavigate();
  const [zone, setZone] = useState("all");
  const [period, setPeriod] = useState<Period>("8");
  const [variable, setVariable] = useState<ChartVariable>("volume");
  const [openZone, setOpenZone] = useState<ZoneRow | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<CalcLogEntry[]>(INITIAL_CALC_LOG);

  const zoneName = zone === "all" ? "Toutes les zones" : DEMO_ZONES.find((z) => z.id === zone)?.name ?? zone;
  const fullSeries = useMemo(() => getSeries(zone), [zone]);
  const globalSeries = useMemo(() => getSeries("all"), []);
  const series = useMemo(() => { const back = PERIODS[period]; return fullSeries.filter((d) => d.weekIndex > CURRENT_WEEK - back); }, [fullSeries, period]);
  const zones = useMemo(() => getZoneRows(), []);
  const quality = useMemo(() => getDataQuality(), []);

  const next = fullSeries.find((d) => d.horizon === 1);
  const last = fullSeries.find((d) => d.weekIndex === CURRENT_WEEK);
  const prevPred = last?.actual ?? last?.predicted ?? 0;
  const s1 = next?.predicted ?? 0;
  const variation = prevPred ? ((s1 - prevPred) / prevPred) * 100 : 0;
  const cum4 = fullSeries.filter((d) => d.horizon >= 1 && d.horizon <= 4).reduce((s, d) => s + (d.predicted ?? 0), 0);
  const globalNext = globalSeries.find((d) => d.horizon === 1)?.predicted ?? 0;
  const cap = capacityState(globalNext);
  const futureGlobal = globalSeries.filter((d) => d.horizon > 0);
  const priorityZones = [...zones].sort((a, b) => b.s4 - a.s4).slice(0, 3);
  const producers = useMemo(() => getProducerSegments(priorityZones.map((z) => z.id)), [priorityZones.map((z) => z.id).join()]);

  const alerts = useMemo(() => {
    const out: { tone: "warning" | "info" | "caution"; title: string; text: string; action: string; onClick: () => void }[] = [];
    const over = futureGlobal.filter((d) => (d.predicted ?? 0) > CAPACITY.weekly * 1.05);
    if (over.length) out.push({ tone: "warning", title: "Risque de surcharge", text: `Volume prévu supérieur à la capacité hebdomadaire indicative sur ${over.map((d) => `S+${d.horizon}`).join(", ")} (jusqu’à ${fmt(Math.max(...over.map((d) => d.predicted ?? 0)))} t).`, action: "Analyser les collectes", onClick: () => { setVariable("capacite"); setZone("all"); } });
    const under = futureGlobal.filter((d) => (d.predicted ?? 0) < CAPACITY.weekly * 0.9);
    if (under.length) out.push({ tone: "info", title: "Sous-utilisation possible", text: `Volume prévu inférieur à 90 % de la capacité indicative sur ${under.map((d) => `S+${d.horizon}`).join(", ")}.`, action: "Analyser les zones disponibles", onClick: () => document.getElementById("zones")?.scrollIntoView({ behavior: "smooth" }) });
    const worst = [...zones].sort((a, b) => b.uncertainty / Math.max(b.s1, 1) - a.uncertainty / Math.max(a.s1, 1))[0];
    if (worst && worst.uncertainty / Math.max(worst.s1, 1) > 0.09) out.push({ tone: "caution", title: "Incertitude élevée", text: `Dispersion relative de ±${Math.round((worst.uncertainty / worst.s1) * 100)} % à S+1 dans la zone ${worst.name}.`, action: "Voir les détails", onClick: () => setOpenZone(worst) });
    return out;
  }, [futureGlobal, zones]);

  const history = globalSeries.filter((d) => d.horizon === 0 && d.actual !== null).slice(-8).reverse();

  const recalc = () => {
    setLoading(true);
    window.setTimeout(() => {
      const now = new Date();
      setLog((l) => [{ at: `${now.toLocaleDateString("fr-FR")} — ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`, action: "Prévision recalculée (démo)", model: `${MODEL.name} · ${MODEL.version}`, horizon: `${MODEL.horizon} semaines` }, ...l]);
      setLoading(false);
      toast.success("Prévision recalculée", { description: "Jeu de démonstration relu. Aucun moteur réel n’est connecté." });
    }, 1100);
  };

  const exportCsv = () => {
    const rows = [["zone", "semaine", "horizon", "prevision_t", "borne_basse_t", "borne_haute_t", "observe_t", "capacite_hebdo_hypothese_t", "modele", "statut"]];
    DEMO_ZONES.forEach((z) => getSeries(z.id).forEach((d) => rows.push([z.name, d.week, String(d.horizon), String(d.predicted ?? ""), String(d.lower ?? ""), String(d.upper ?? ""), String(d.actual ?? ""), String(CAPACITY.weekly), `${MODEL.name} ${MODEL.version}`, d.horizon ? "SORTIE_MODELE_SIMULEE" : "SIMULE"])));
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `agriflow-previsions-SIMULE-${weekLabel(CURRENT_WEEK)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast.success("Export CSV généré", { description: "Fichier issu du jeu de démonstration (SIMULÉ)." });
  };

  const planCollect = () => {
    const payload = { at: new Date().toISOString(), period: `${weekLabel(CURRENT_WEEK + 1)} → ${weekLabel(CURRENT_WEEK + 4)}`, zones: priorityZones.map((z) => ({ name: z.name, s1: z.s1, s4: z.s4, uncertainty: z.uncertainty })), capacityWeekly: CAPACITY.weekly, status: "SIMULÉ" };
    sessionStorage.setItem("agriflow.forecastHandoff", JSON.stringify(payload));
    toast.success("Prévisions transmises au Module 01");
    navigate({ to: "/module1" });
  };

  const actions = <>
    <Select value="2026"><SelectTrigger className="hidden h-9 w-36 md:flex" aria-label="Campagne"><CalendarRange className="size-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2026">Campagne 2026</SelectItem></SelectContent></Select>
    <Select value={zone} onValueChange={setZone}><SelectTrigger className="h-9 w-32 sm:w-36" aria-label="Zone"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les zones</SelectItem>{DEMO_ZONES.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent></Select>
    <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => setConfirmOpen(true)}><RotateCw className={loading ? "animate-spin" : ""} />Recalculer</Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Download /><span className="hidden sm:inline">Exporter</span></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60"><DropdownMenuLabel>Exporter les prévisions</DropdownMenuLabel><DropdownMenuItem onClick={exportCsv}>CSV — prévisions, zones, intervalles</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled>Excel — à connecter</DropdownMenuItem><DropdownMenuItem disabled>PDF — à connecter</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <span className="hidden size-8 place-items-center rounded-full bg-accent font-mono text-[10px] font-bold xl:grid" title="Mor Diouf">MD</span>
  </>;

  return <EnterpriseShell active="module3" code="AGRIFLOW / MODULE 03 / PRÉVISIONS" title="Prévision des volumes de récolte" subtitle="Anticipation des volumes par zone et par semaine · Dernière mise à jour : aujourd’hui, 14:32" status="FORECAST INTELLIGENCE · MODE DÉMONSTRATION" actions={actions}>

    {/* Bandeau moteur */}
    <div className="engine-bar">
      <div className="flex items-center gap-3"><span className="engine-icon"><Cpu className="size-4" /></span><div><p className="eyebrow">FORECAST ENGINE</p><p className="flex items-center gap-2 text-sm font-semibold"><span className="size-2 rounded-full bg-primary" />Modèle actif <span className="font-normal text-muted-foreground">· validation en cours</span></p></div></div>
      <dl className="engine-facts"><div><dt>Modèle</dt><dd>{MODEL.name}</dd></div><div><dt>Version</dt><dd>{MODEL.version}</dd></div><div><dt>Horizon</dt><dd>{MODEL.horizon} semaines</dd></div><div><dt>Entraînement</dt><dd>{MODEL.trainedAt}</dd></div><div><dt>Prévision</dt><dd>{MODEL.forecastAt}</dd></div><div><dt>Données</dt><dd>Historiques + météo</dd></div></dl>
      <Button variant="outline" size="sm" onClick={() => setModelOpen(true)}><Info />Voir les détails du modèle</Button>
    </div>

    {/* KPI */}
    <div className="fc-kpis mt-3">
      {loading ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[118px]" />) : <>
        <Kpi label="VOLUME PRÉVU — S+1" value={fmt(s1)} unit=" t" label2={<DataLabel status="modele" />} detail={<Trend v={variation} suffix=" vs semaine précédente" />} />
        <Kpi label="CUMUL PRÉVU — 4 SEMAINES" value={fmt(cum4, 0)} unit=" t" label2={<DataLabel status="modele" />} detail={<span>{weekLabel(CURRENT_WEEK + 1)} → W{CURRENT_WEEK + 4}</span>} />
        <Kpi label="CAPACITÉ USINE" value={fmt(CAPACITY.annual, 0)} unit=" t/an" label2={<DataLabel status="projet" />} detail={<span className="flex flex-wrap items-center gap-1">Hebdo. indicative {fmt(CAPACITY.weekly)} t <DataLabel status="hypothese" title={`Hypothèse de conversion : ${CAPACITY.weeksAssumed} semaines d’exploitation`} /></span>} />
        <Kpi label="UTILISATION PRÉVUE (S+1)" value={fmt(cap.ratio * 100)} unit=" %" label2={<DataLabel status="modele" />} detail={<span className={cap.key === "saturation" ? "text-destructive" : cap.key === "equilibre" ? "text-secondary-route" : "text-primary"}>{cap.label}</span>} />
        <Kpi label="ZONES SUIVIES" value={String(DEMO_ZONES.length)} label2={<DataLabel status="simule" />} detail={<span>Zones de production couvertes</span>} />
        <Kpi label="QUALITÉ DU MODÈLE" value="3,64" unit=" t MAE" label2={<DataLabel status="modele" title="Résultat du protocole expérimental walk-forward" />} detail={<span>RMSE 7,99 t · Biais −1,60 t</span>} />
      </>}
    </div>

    {/* Graphique principal */}
    <Section className="mt-3" eyebrow="HISTORIQUE & FUTUR" title={`Prévision des volumes — ${zoneName}`} aside={<div className="chart-key"><span><i className="bg-primary" />Observé</span><span><i className="bg-chart-2" />Prévision</span><span><i className="bg-chart-2 opacity-30" />Intervalle 80 %</span></div>}>
      <div className="fc-filters">
        <Seg label="Période" value={period} onChange={(v) => setPeriod(v as Period)} options={[["4", "4 sem."], ["8", "8 sem."], ["12", "12 sem."], ["all", "Campagne"]]} />
        <Seg label="Agrégation" value={zone === "all" ? "global" : "zone"} onChange={(v) => { if (v === "global") setZone("all"); else if (zone === "all") setZone(DEMO_ZONES[0].id); }} options={[["global", "Global"], ["zone", "Zone"], ["producteur", "Producteur"]]} disabled={["producteur"]} />
        <Seg label="Variable" value={variable} onChange={(v) => setVariable(v as ChartVariable)} options={[["volume", "Volume"], ["capacite", "Capacité"], ["ecart", "Écart cap./prév."]]} />
      </div>
      <div className="overflow-x-auto">{loading ? <Skeleton className="h-[300px]" /> : <ForecastChart data={series} capacity={zone === "all" ? CAPACITY.weekly : Math.round(CAPACITY.weekly * ((zones.find((z) => z.id === zone)?.contribution ?? 100) / 100) * 10) / 10} variable={variable} currentWeek={CURRENT_WEEK} zoneName={zoneName} />}</div>
      <p className="method-note mt-2">Historique : volumes simulés. Prévision et bande : sorties du modèle sur jeu de démonstration. {zone !== "all" && variable !== "volume" && "Capacité de zone = capacité hebdo. × contribution de la zone (hypothèse)."}</p>
    </Section>

    <div className="fc-grid-2 mt-3">
      {/* Capacité */}
      <Section eyebrow="PRÉVISION VS CAPACITÉ" title="Prévision vs capacité de traitement" aside={<DataLabel status="hypothese" title="Capacité hebdomadaire issue d’une conversion 8 500 t/an ÷ 52" />}>
        <div className="space-y-2">{futureGlobal.map((d) => { const st = capacityState(d.predicted ?? 0); return <div key={d.week} className="cap-row"><span className="font-mono text-[11px]">S+{d.horizon}</span><div className="cap-track"><i className={`cap-${st.key}`} style={{ width: `${Math.min(100, (st.ratio / 1.4) * 100)}%` }} /><b style={{ left: `${(1 / 1.4) * 100}%` }} /></div><span className="w-32 whitespace-nowrap text-right font-mono text-[11px]">{fmt(d.predicted ?? 0)} t · {Math.round(st.ratio * 100)} %</span></div>; })}</div>
        <div className={`cap-status mt-3 cap-status-${cap.key}`}><Factory className="size-4" /><div><b>{cap.label}</b><p>S+1 : {fmt(globalNext)} t prévues pour {fmt(CAPACITY.weekly)} t de capacité indicative. Alerte opérationnelle issue du modèle, non une certitude.</p></div></div>
      </Section>

      {/* Alertes */}
      <Section eyebrow="ALERTES PRÉVISIONNELLES" title="Alertes générées depuis les prévisions" aside={<span className="font-mono text-[10px] text-muted-foreground">{alerts.length} active{alerts.length > 1 ? "s" : ""}</span>}>
        {alerts.length === 0 ? <p className="text-sm text-muted-foreground">Aucune alerte : les prévisions restent dans les seuils définis.</p> :
          <div className="space-y-2">{alerts.map((a) => <div key={a.title} className={`fc-alert fc-alert-${a.tone}`}><AlertTriangle className="size-4 shrink-0" /><div className="min-w-0 flex-1"><b>{a.title}</b><p>{a.text}</p></div><Button variant="ghost" size="sm" onClick={a.onClick}>{a.action}<ArrowRight /></Button></div>)}</div>}
        <p className="method-note mt-3">Seuils : surcharge &gt; 105 % · sous-utilisation &lt; 90 % de la capacité indicative · incertitude &gt; ±9 % à S+1.</p>
      </Section>
    </div>

    {/* Zones */}
    <div id="zones" className="fc-grid-zones mt-3">
      <Section eyebrow="PRÉVISIONS PAR ZONE" title="Prévisions par zone" aside={<DataLabel status="modele" />}>
        <div className="overflow-x-auto"><table className="producer-table ops-table"><thead><tr><th>Zone</th><th className="text-right">Actuel (W{CURRENT_WEEK})</th><th className="text-right">Prévision S+1</th><th className="text-right">Prévision S+4</th><th>Tendance</th><th>Incertitude</th><th className="text-right">Contribution</th><th /></tr></thead>
          <tbody>{zones.map((z) => <tr key={z.id} className={zone === z.id ? "bg-primary/5" : ""}><td><span className="flex items-center gap-2 font-medium"><MapPin className="size-3 text-primary" />{z.name}</span></td><td className="text-right font-mono">{z.current !== null ? `${fmt(z.current)} t` : <span className="text-muted-foreground">Non disponible</span>}</td><td className="text-right font-mono">{fmt(z.s1)} t</td><td className="text-right font-mono">{fmt(z.s4, 0)} t</td><td><TrendBadge t={z.trend} /></td><td className="font-mono">±{fmt(z.uncertainty)} t</td><td className="text-right"><span className="score-cell justify-end"><i style={{ width: `${z.contribution * 2.5}%` }} />{fmt(z.contribution)} %</span></td><td><Button variant="ghost" size="sm" onClick={() => setOpenZone(z)} aria-label={`Voir la zone ${z.name}`}>Voir</Button></td></tr>)}</tbody></table></div>
      </Section>
      <Section eyebrow="CARTE" title="Intensité prévue S+4" aside={<span className="demo-badge">CARTE EN MODE DÉMONSTRATION</span>}>
        <svg viewBox="100 60 980 200" className="w-full" role="img" aria-label="Carte schématique des zones">
          <path d="M120 205 C 260 190, 380 215, 520 190 S 800 175, 1060 150" fill="none" stroke="var(--color-chart-2)" strokeOpacity=".35" strokeWidth="5" />
          <text x="130" y="230" className="chart-label">Fleuve Casamance (schématique)</text>
          {zones.map((z) => { const r = 10 + (z.s4 / Math.max(...zones.map((q) => q.s4))) * 22; return <g key={z.id} className="cursor-pointer" onClick={() => setOpenZone(z)}><circle cx={z.coordinates.x} cy={z.coordinates.y} r={r} fill="var(--color-primary)" fillOpacity={0.12 + z.contribution / 60} stroke="var(--color-primary)" /><text x={z.coordinates.x} y={z.coordinates.y - r - 5} textAnchor="middle" className="chart-label" fontWeight="600">{z.name}</text><text x={z.coordinates.x} y={z.coordinates.y + 3} textAnchor="middle" className="chart-label">{fmt(z.s4, 0)} t</text></g>; })}
        </svg>
        <p className="method-note">Positions schématiques, non géoréférencées. Clic sur une zone : détail, prévision, producteurs, lien Module 01.</p>
      </Section>
    </div>

    {/* Météo / facteurs / incertitude */}
    <div className="fc-grid-3 mt-3">
      <Section eyebrow="MÉTÉOROLOGIE" title="Variables météorologiques" aside={<CloudRain className="size-4 text-primary" />}>
        <table className="w-full text-[11px]"><thead><tr className="text-muted-foreground"><th className="py-1 text-left font-normal">Semaine</th><th className="text-right font-normal">Pluie</th><th className="text-right font-normal">T moy.</th><th className="text-right font-normal">T max</th><th className="text-right font-normal">Hum.</th></tr></thead>
          <tbody className="font-mono">{WEATHER.filter((w) => { const i = Number(w.week.slice(-2)); return i > CURRENT_WEEK - 4 && i <= CURRENT_WEEK + 3; }).map((w) => <tr key={w.week} className={`border-t border-border ${w.dataStatus === "a_obtenir" ? "text-muted-foreground" : ""}`}><td className="py-1">{w.week.slice(5)}</td><td className="text-right">{w.rain ?? "—"}{w.rain !== null && " mm"}</td><td className="text-right">{w.tempMean ?? "—"}</td><td className="text-right">{w.tempMax ?? "—"}</td><td className="text-right">{w.humidity ?? "—"}{w.humidity !== null && " %"}</td></tr>)}</tbody></table>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">Historique <DataLabel status="simule" /> · Futur <DataLabel status="a_obtenir" title="Aucune source météo prévisionnelle connectée" /></div>
      </Section>
      <Section eyebrow="FACTEURS DE PRÉVISION" title="Variables utilisées par le modèle">
        <ul className="space-y-2">{MODEL_VARIABLES.map((v) => <li key={v.name} className="border-l-2 border-primary/40 pl-3"><p className="text-sm font-medium">{v.name}</p><p className="text-[11px] text-muted-foreground">{v.detail}</p></li>)}</ul>
        <p className="method-note mt-3">Aucune importance de variable n’est calculée : pas de pourcentage affiché.</p>
      </Section>
      <Section eyebrow="INCERTITUDE" title="Incertitude des prévisions" aside={<DataLabel status="modele" />}>
        <p className="text-sm font-medium">Une prévision n’est pas une valeur exacte.</p>
        <div className="unc-box mt-3"><p className="eyebrow">S+1 · {zoneName}</p><b className="font-mono text-3xl">{fmt(s1)} t</b><p className="mt-1 font-mono text-sm">[{fmt(next?.lower ?? 0)} t ; {fmt(next?.upper ?? 0)} t]</p>
          <div className="unc-bar mt-3"><i style={{ left: "10%", right: "10%" }} /><b style={{ left: "50%" }} /></div><div className="flex justify-between font-mono text-[10px] text-muted-foreground"><span>Borne basse</span><span>Centrale</span><span>Borne haute</span></div></div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">L’intervalle représente une zone d’incertitude autour de la prévision. Il doit être interprété avec prudence lors de la planification : il s’élargit avec l’horizon (S+8 ≈ ±{fmt(((futureGlobal.at(-1)?.upper ?? 0) - (futureGlobal.at(-1)?.lower ?? 0)) / 2)} t global).</p>
      </Section>
    </div>

    {/* Passerelles modules */}
    <div className="fc-grid-2 mt-3">
      <Section eyebrow="MODULE 03 → MODULE 01" title="Prévision → Planification de collecte" aside={<RouteIcon className="size-4 text-primary" />}>
        <p className="text-sm text-muted-foreground">Les prévisions peuvent être utilisées pour préparer l’optimisation des tournées du Module 01.</p>
        <div className="mt-3 grid grid-cols-2 gap-3"><div className="unc-box"><p className="eyebrow">VOLUME PRÉVU · 4 SEM.</p><b className="font-mono text-2xl">{fmt(futureGlobal.slice(0, 4).reduce((s, d) => s + (d.predicted ?? 0), 0), 0)} t</b></div><div className="unc-box"><p className="eyebrow">ZONES PRIORITAIRES</p><p className="mt-1 text-sm font-medium">{priorityZones.map((z) => z.name).join(" · ")}</p></div></div>
        <div className="flow-line mt-3">{["Volumes prévus", "Zones disponibles", "Module 01", "Tournées"].map((s, i) => <span key={s}>{i > 0 && <ArrowRight className="size-3" />}{s}</span>)}</div>
        <div className="mt-3 flex flex-wrap gap-2"><Button onClick={planCollect}><RouteIcon />Planifier la collecte</Button><Button variant="outline" className="max-w-full" asChild><Link to="/assistant"><Bot />Demander à AGRIFLOW AI</Link></Button></div>
      </Section>
      <Section eyebrow="MODULE 03 → MODULE 02" title="Producteurs concernés" aside={<DataLabel status="simule" />}>
        <p className="text-sm"><b className="font-mono">{fmt(producers.count, 0)}</b> producteurs dans les zones prioritaires ({producers.zones.join(", ")}).</p>
        <div className="mt-3 space-y-2">{producers.segments.map((s) => <div key={s.id} className="cap-row"><span className="w-32 truncate text-[12px] font-medium">{s.name}</span><div className="cap-track"><i className="cap-sous" style={{ width: `${(s.count / Math.max(producers.count, 1)) * 100}%` }} /></div><span className="w-36 text-right font-mono text-[11px]">{s.count} prod. · {fmt(s.volume, 0)} t</span></div>)}</div>
        <p className="method-note mt-2">Volume par segment = volume S+1→S+4 réparti au prorata de la production déclarée (hypothèse).</p>
        <Button variant="outline" className="mt-3" asChild><Link to="/module2"><UsersRound />Analyser les producteurs</Link></Button>
      </Section>
    </div>

    {/* Modèle */}
    <div className="fc-grid-2 mt-3">
      <Section eyebrow="ÉVALUATION" title="Performance du modèle" aside={<span className="demo-badge">STATUT : EXPÉRIMENTAL</span>}>
        <div className="grid grid-cols-3 gap-3">{[["MAE", "3,64 t"], ["RMSE", "7,99 t"], ["BIAIS", "−1,60 t"]].map(([k, v]) => <div key={k} className="unc-box"><p className="eyebrow">{k}</p><b className="font-mono text-2xl">{v}</b></div>)}</div>
        <p className="mt-3 text-[12px] text-muted-foreground">Protocole : <b className="text-foreground">walk-forward temporel</b> · Validation sur données historiques. Résultats du protocole expérimental actuel, pas encore validés sur données terrain.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setMethodOpen(true)}>Comment fonctionne la prévision ?</Button><Button variant="ghost" size="sm" onClick={() => setModelOpen(true)}>Voir l’évaluation complète</Button></div>
      </Section>
      <Section eyebrow="BENCHMARK" title="Benchmark des modèles">
        <div className="overflow-x-auto"><table className="producer-table ops-table"><thead><tr><th>Modèle</th><th className="text-right">MAE</th><th className="text-right">RMSE</th><th className="text-right">Biais</th><th>Statut</th></tr></thead>
          <tbody>{BENCHMARK.map((m) => <tr key={m.modelName} className={m.status === "Actuel" ? "bg-primary/5" : ""}><td className="font-medium">{m.modelName}</td>{[m.mae, m.rmse, m.bias].map((v, i) => <td key={i} className="text-right font-mono">{v === null ? <span className="text-muted-foreground">à renseigner</span> : fmt(v, 2)}</td>)}<td><span className={`risk-cell ${m.status === "Actuel" ? "risk-low" : m.status === "À évaluer" ? "risk-high" : "risk-medium"}`}>{m.status}</span></td></tr>)}</tbody></table></div>
        <p className="method-note mt-2">Aucun classement ni score global : les métriques sont présentées pour analyse.</p>
      </Section>
    </div>

    <div className="fc-grid-3 mt-3">
      <Section eyebrow="TRAÇABILITÉ" title="Historique des prévisions" className="fc-span-2" aside={<DataLabel status="simule" />}>
        <div className="overflow-x-auto"><table className="producer-table ops-table"><thead><tr><th>Date de calcul</th><th>Horizon</th><th>Modèle</th><th className="text-right">Prévu</th><th className="text-right">Réel</th><th className="text-right">Erreur</th></tr></thead>
          <tbody>{history.map((d) => { const err = (d.predicted ?? 0) - (d.actual ?? 0); return <tr key={d.week}><td className="font-mono">{weekLabel(d.weekIndex - 1)}</td><td>S+1 → {d.week.slice(5)}</td><td>{MODEL.name}</td><td className="text-right font-mono">{fmt(d.predicted ?? 0)} t</td><td className="text-right font-mono">{fmt(d.actual ?? 0)} t</td><td className={`text-right font-mono ${Math.abs(err) > 8 ? "text-secondary-route" : ""}`}>{err > 0 ? "+" : ""}{fmt(err)} t</td></tr>; })}</tbody></table></div>
      </Section>
      <Section eyebrow="QUALITÉ DES DONNÉES" title="Qualité des données" aside={<Database className="size-4 text-primary" />}>
        <dl className="dq-list">
          <div><dt>Observations disponibles</dt><dd>{quality.observations} / {quality.expected}</dd></div>
          <div><dt>Valeurs manquantes</dt><dd>{fmt(quality.missingPct)} %</dd></div>
          <div><dt>Couverture temporelle</dt><dd>{quality.temporal}</dd></div>
          <div><dt>Couverture géographique</dt><dd>{quality.zones} zones</dd></div>
          <div><dt>Semaines météo</dt><dd>{quality.weatherWeeks}</dd></div>
          <div><dt>Dernière mise à jour</dt><dd>{MODEL.forecastAt}</dd></div>
        </dl>
        <p className="method-note mt-2">Calculé dynamiquement sur le jeu de démonstration. Sources : historique simulé, météo simulée.</p>
      </Section>
    </div>

    <div className="fc-grid-2 mt-3">
      <Section eyebrow="JOURNAL" title="Historique des calculs">
        <ol className="space-y-2">{log.map((e, i) => <li key={`${e.at}-${i}`} className="flex items-start gap-3 border-b border-border pb-2 last:border-0"><CheckCircle2 className="mt-0.5 size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{e.action}</p><p className="text-[11px] text-muted-foreground">{e.model} · horizon {e.horizon}</p></div><span className="font-mono text-[10px] text-muted-foreground">{e.at}</span></li>)}</ol>
      </Section>
      <Section eyebrow="LABELS" title="Statut des données">
        <DataLegend />
        <p className="mt-3 text-[12px] text-muted-foreground">Chaque valeur est étiquetée là où une confusion est possible. En mode démonstration, aucune donnée réelle n’est connectée : la capacité 8 500 t/an est une donnée projet, sa conversion hebdomadaire une hypothèse, les prévisions des sorties du modèle, la météo future est à obtenir.</p>
        <div className="flow-line mt-3">{["Frontend", "API", "Forecast Engine Python", "Base de données", "Météo / historique"].map((s, i) => <span key={s}>{i > 0 && <ArrowRight className="size-3" />}{s}</span>)}</div>
      </Section>
    </div>

    {/* Drawer zone */}
    <Sheet open={openZone !== null} onOpenChange={(o) => !o && setOpenZone(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {openZone && <ZoneDetail z={openZone} onPlan={planCollect} onFocus={() => { setZone(openZone.id); setOpenZone(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      </SheetContent>
    </Sheet>

    {/* Détails modèle */}
    <Dialog open={modelOpen} onOpenChange={setModelOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{MODEL.name} · {MODEL.version}</DialogTitle><DialogDescription>Modèle en deux étapes. Statut : expérimental / validation en cours.</DialogDescription></DialogHeader>
      <dl className="dq-list"><div><dt>Horizon</dt><dd>{MODEL.horizon} semaines</dd></div><div><dt>Dernier entraînement</dt><dd>{MODEL.trainedAt}</dd></div><div><dt>Protocole</dt><dd>Walk-forward temporel</dd></div><div><dt>MAE / RMSE / Biais</dt><dd>3,64 / 7,99 / −1,60 t</dd></div><div><dt>Correction</dt><dd>Smearing de Duan (retransformation)</dd></div><div><dt>Données</dt><dd>Historiques + météo (simulées)</dd></div></dl>
      <Button variant="outline" onClick={() => { setModelOpen(false); setMethodOpen(true); }}>Voir la méthodologie</Button>
    </DialogContent></Dialog>

    {/* Méthodologie hurdle */}
    <Dialog open={methodOpen} onOpenChange={setMethodOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Comment fonctionne la prévision ?</DialogTitle><DialogDescription>Un modèle « hurdle » sépare la présence de récolte de sa quantité.</DialogDescription></DialogHeader>
      <div className="hurdle-steps">{[["1", "Probabilité de volume positif", "Le modèle estime si un volume de récolte est susceptible d’être présent dans la zone et la semaine."], ["2", "Volume conditionnel", "Lorsque le volume est positif, un modèle Ridge estime sa quantité, corrigée par le facteur de Duan."], ["=", "Prévision finale", "Probabilité × volume conditionnel, avec un intervalle d’incertitude."]].map(([n, t, d]) => <div key={t}><span>{n}</span><div><b>{t}</b><p>{d}</p></div></div>)}</div>
    </DialogContent></Dialog>

    {/* Confirmation recalcul */}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Recalculer la prévision ?</AlertDialogTitle><AlertDialogDescription>En mode démonstration, le jeu simulé est relu et le calcul est ajouté au journal. Aucun moteur réel n’est sollicité.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={recalc}>Recalculer</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </EnterpriseShell>;
}

function Kpi({ label, value, unit, detail, label2 }: { label: string; value: string; unit?: string; detail: ReactNode; label2: ReactNode }) {
  return <article className="ops-metric fc-kpi"><div className="flex items-start justify-between gap-2"><p>{label}</p>{label2}</div><div className="mt-3 font-mono"><b>{value}</b>{unit && <span>{unit}</span>}</div><small>{detail}</small></article>;
}
function Trend({ v, suffix }: { v: number; suffix: string }) {
  const Icon = v > 0.5 ? ArrowUp : v < -0.5 ? ArrowDown : Minus;
  return <span className={v > 0.5 ? "text-primary" : v < -0.5 ? "text-secondary-route" : ""}><Icon className="mr-0.5 inline size-3" />{v > 0 ? "+" : ""}{fmt(v)} %{suffix}</span>;
}
function TrendBadge({ t }: { t: ZoneRow["trend"] }) {
  const m = { hausse: ["↑ Hausse", "risk-low"], stable: ["→ Stable", "risk-medium"], baisse: ["↓ Baisse", "risk-high"] } as const;
  return <span className={`risk-cell ${m[t][1]}`}>{m[t][0]}</span>;
}
function Seg({ label, value, onChange, options, disabled = [] }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; disabled?: string[] }) {
  return <div className="fc-seg"><span>{label}</span><div role="group" aria-label={label}>{options.map(([k, l]) => <button key={k} type="button" disabled={disabled.includes(k)} title={disabled.includes(k) ? "À connecter" : undefined} className={value === k ? "active" : ""} onClick={() => onChange(k)}>{l}</button>)}</div></div>;
}

function ZoneDetail({ z, onPlan, onFocus }: { z: ZoneRow; onPlan: () => void; onFocus: () => void }) {
  const s = getSeries(z.id);
  const cap = Math.round(CAPACITY.weekly * (z.contribution / 100) * 10) / 10;
  const prods = getProducerSegments([z.id]);
  return <>
    <SheetHeader><SheetTitle>Zone : {z.name}</SheetTitle><SheetDescription>Historique simulé et prévision du modèle · {MODEL.name}</SheetDescription></SheetHeader>
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{[["Moyenne historique", `${fmt(z.avg)} t/sem.`], ["Dernier observé", z.current !== null ? `${fmt(z.current)} t` : "Non disponible"], ["Prévision S+1", `${fmt(z.s1)} t`], ["Prévision S+4 (cumul)", `${fmt(z.s4, 0)} t`], ["Tendance", z.trend], ["MAE historique", z.mae !== null ? `${fmt(z.mae, 2)} t` : "Non disponible"]].map(([k, v]) => <div key={k} className="unc-box"><p className="eyebrow">{k}</p><b className="font-mono text-base capitalize">{v}</b></div>)}</div>
    <p className="eyebrow mt-5 mb-2">HISTORIQUE + PRÉVISION DE LA ZONE</p>
    <div className="overflow-x-auto"><ForecastChart data={s} capacity={cap} variable="volume" currentWeek={CURRENT_WEEK} zoneName={z.name} height={240} /></div>
    <p className="eyebrow mt-5 mb-2">VARIABLES EXPLICATIVES DISPONIBLES</p>
    <div className="flex flex-wrap gap-1.5">{["Volume précédent", "Moyenne mobile 3 sem.", "Pluie (retardée)", "Température", "Humidité", "Semaine de campagne"].map((v) => <span key={v} className="rounded border border-border px-2 py-1 text-[11px]">{v}</span>)}</div>
    <p className="mt-4 text-[12px] text-muted-foreground">{prods.count} producteurs simulés dans la zone.</p>
    <div className="mt-4 flex flex-wrap gap-2"><Button onClick={onPlan}><RouteIcon />Planifier la collecte</Button><Button variant="outline" asChild><Link to="/module2"><UsersRound />Producteurs</Link></Button><Button variant="ghost" onClick={onFocus}>Afficher dans le graphique</Button></div>
  </>;
}
