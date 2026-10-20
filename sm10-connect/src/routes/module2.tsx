import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowDown, ArrowRight, ArrowUp, BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Edit3, Filter, Menu, MoreHorizontal, Play, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Sparkles, Target, TrendingUp, UsersRound, X } from "lucide-react";
import { AgriFlowNav } from "@/components/AgriFlowNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CLUSTER_DEFAULTS, ELBOW, KPI_M2, PRODUCERS, ZONES, levelFor, type ClusterId, type Producer } from "@/lib/module2-data";

export const Route = createFileRoute("/module2")({
  head: () => ({ meta: [
    { title: "Producer Intelligence | AgriFlow SM10" },
    { name: "description", content: "Scoring, segmentation et priorisation des producteurs sur données simulées." },
    { property: "og:title", content: "Producer Intelligence | AgriFlow SM10" },
    { property: "og:description", content: "Centre d’intelligence producteurs pour l’analyse des segments, scores et risques." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Module2,
});

type ColorMode = "Cluster" | "Priority Score" | "Risk Score" | "Geographic Zone";
type SortKey = "id" | "production" | "regularity" | "quality" | "priority" | "risk";
const CLUSTERS: ClusterId[] = ["strategic", "regular", "emerging", "at-risk"];
const CLUSTER_COLOR: Record<ClusterId, string> = { strategic: "var(--color-primary)", regular: "var(--color-chart-3)", emerging: "var(--color-secondary-route)", "at-risk": "var(--color-destructive)" };
const ZONE_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)", "var(--color-factory)"];

function Module2() {
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [priority, setPriority] = useState("all");
  const [risk, setRisk] = useState("all");
  const [productionMin, setProductionMin] = useState(0);
  const [qualityMin, setQualityMin] = useState(0);
  const [regularityMin, setRegularityMin] = useState(0);
  const [colorMode, setColorMode] = useState<ColorMode>("Cluster");
  const [selected, setSelected] = useState<Producer | null>(null);
  const [hovered, setHovered] = useState<Producer | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(false);
  const [names, setNames] = useState(CLUSTER_DEFAULTS);
  const [editingNames, setEditingNames] = useState(false);
  const [analysisPulse, setAnalysisPulse] = useState(false);

  const filtered = useMemo(() => PRODUCERS.filter((producer) => {
    const term = search.trim().toLowerCase();
    return (!term || producer.id.toLowerCase().includes(term) || producer.zone.toLowerCase().includes(term)) &&
      (zone === "all" || producer.zone === zone) && (cluster === "all" || producer.cluster === cluster) &&
      (priority === "all" || levelFor(producer.priority).toLowerCase() === priority) &&
      (risk === "all" || levelFor(producer.risk).toLowerCase() === risk) && producer.production >= productionMin &&
      producer.quality >= qualityMin && producer.regularity >= regularityMin;
  }), [search, zone, cluster, priority, risk, productionMin, qualityMin, regularityMin]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortAsc ? result : -result;
  }), [filtered, sortKey, sortAsc]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / 10));
  const pageRows = sorted.slice((Math.min(page, pageCount) - 1) * 10, Math.min(page, pageCount) * 10);

  const segmentStats = useMemo(() => CLUSTERS.map((id) => {
    const rows = filtered.filter((producer) => producer.cluster === id);
    return { id, count: rows.length, production: avg(rows, "production"), regularity: avg(rows, "regularity"), quality: avg(rows, "quality"), priority: avg(rows, "priority"), risk: avg(rows, "risk") };
  }), [filtered]);
  const reset = () => { setZone("all"); setCluster("all"); setPriority("all"); setRisk("all"); setProductionMin(0); setQualityMin(0); setRegularityMin(0); setSearch(""); setPage(1); };
  const runAnalysis = () => { setAnalysisPulse(true); window.setTimeout(() => setAnalysisPulse(false), 1600); };
  const highPriority = filtered.filter((p) => p.priority >= 70).length;
  const highRisk = filtered.filter((p) => p.risk >= 70).length;
  const strategic = segmentStats.find((s) => s.id === "strategic");

  return <div className="producer-app min-h-screen bg-background text-foreground">
    <aside className="hidden lg:block"><AgriFlowNav active="module2"/></aside>
    <main className="producer-main">
      <header className="producer-header">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Ouvrir la navigation"><Menu/></Button>
          <div className="min-w-0"><p className="font-mono text-[9px] text-primary">MODULE 02 / PRODUCER INTELLIGENCE</p><h1 className="truncate text-xl font-semibold sm:text-2xl">Scoring & Segmentation</h1><p className="hidden text-xs text-muted-foreground sm:block">Comprendre les profils producteurs et prioriser les actions opérationnelles.</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="hidden xl:inline-flex"><CalendarDays className="size-3.5"/>Last 12 months<ChevronDown className="size-3"/></Button>
          <Button variant="outline" size="icon" title="Actualiser"><RefreshCw className="size-4"/><span className="sr-only">Actualiser</span></Button>
          <Button variant="outline" size="sm" className="hidden sm:inline-flex"><Download className="size-3.5"/>Export</Button>
          <Button size="sm" onClick={runAnalysis}><Play className={`size-3.5 ${analysisPulse ? "animate-spin" : ""}`}/>Run Analysis</Button>
        </div>
      </header>

      <div className="producer-content">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3"><div className="flex items-center gap-2"><span className="live-label">ANALYTICS ENGINE — ACTIVE</span><span className="demo-badge">DATA STATUS — DEMO DATA</span></div><p className="hidden font-mono text-[9px] text-muted-foreground sm:block">LAST MODEL RUN · 22 SEP 2026 · 12:22 UTC</p></div>

        <section className="executive-grid">{KPI_M2.map((kpi, index) => <article className="executive-kpi" key={kpi.label}><div className="flex items-start justify-between"><p className="font-mono text-[9px] text-muted-foreground">{kpi.label}</p><span className="demo-dot">DEMO</span></div><p className="mt-3 flex items-baseline gap-1 font-mono"><span className="text-2xl font-semibold">{kpi.value}</span>{"unit" in kpi && <span className="text-xs text-muted-foreground">{kpi.unit}</span>}</p><div className="mt-2 flex items-center justify-between gap-2 text-[10px]"><span className={kpi.tone === "positive" ? "text-primary" : "text-muted-foreground"}>{kpi.delta}</span><span className="truncate text-muted-foreground">{kpi.detail}</span></div><KpiLine index={index}/></article>)}</section>

        <section className="analytics-section mt-4">
          <div className="section-heading"><div><p className="eyebrow">PRODUCER INTELLIGENCE OVERVIEW</p><h2>Analyse des segments et profils</h2></div><span className="text-[10px] text-muted-foreground">{filtered.length.toLocaleString("fr-FR")} producteurs affichés</span></div>
          <FilterBar zone={zone} setZone={setZone} cluster={cluster} setCluster={setCluster} priority={priority} setPriority={setPriority} risk={risk} setRisk={setRisk} productionMin={productionMin} setProductionMin={setProductionMin} qualityMin={qualityMin} setQualityMin={setQualityMin} regularityMin={regularityMin} setRegularityMin={setRegularityMin} onReset={reset}/>
          <div className="intelligence-grid">
            <div className="analytics-pane">
              <div className="pane-title"><div><p className="eyebrow">SEGMENTATION</p><h3>Producer Segmentation</h3></div><Button variant="ghost" size="sm" onClick={() => setEditingNames((v) => !v)}><Edit3 className="size-3.5"/>Renommer</Button></div>
              <div className="segment-stack">{segmentStats.map((segment) => <SegmentBar key={segment.id} segment={segment} total={Math.max(filtered.length, 1)} name={names[segment.id]} editing={editingNames} onName={(value) => setNames((current) => ({ ...current, [segment.id]: value }))}/>)}</div>
            </div>
            <div className="analytics-pane cluster-pane">
              <div className="pane-title"><div><p className="eyebrow">MULTIVARIATE VIEW</p><h3>Producer Cluster Map</h3></div><Select value={colorMode} onValueChange={(v) => setColorMode(v as ColorMode)}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent>{["Cluster", "Priority Score", "Risk Score", "Geographic Zone"].map((m) => <SelectItem value={m} key={m}>{m}</SelectItem>)}</SelectContent></Select></div>
              <ScatterPlot producers={filtered.slice(0, 240)} colorMode={colorMode} hovered={hovered} setHovered={setHovered} names={names}/>
            </div>
          </div>
        </section>

        <section className="analytics-section mt-4">
          <div className="section-heading"><div><p className="eyebrow">SEGMENT PERFORMANCE</p><h2>Comparaison analytique</h2></div><span className="demo-badge">SIMULATED AGGREGATES</span></div>
          <div className="overflow-x-auto"><table className="producer-table segment-table"><thead><tr><th>Segment</th><th>Producers</th><th>Avg Production</th><th>Avg Regularity</th><th>Avg Quality</th><th>Priority</th><th>Risk</th><th>Trend</th></tr></thead><tbody>{segmentStats.map((s, i) => <tr key={s.id}><td><span className="flex items-center gap-2 font-medium"><i className="size-2 rounded-full" style={{ background: CLUSTER_COLOR[s.id] }}/>{names[s.id]}</span></td><td>{s.count}</td><td>{s.production.toFixed(1)} t</td><td>{s.regularity.toFixed(0)}%</td><td>{s.quality.toFixed(0)}%</td><td><ScoreCell value={s.priority}/></td><td><RiskCell value={s.risk}/></td><td>{i === 0 || i === 2 ? <ArrowUp className="size-4 text-primary"/> : i === 1 ? <ArrowRight className="size-4 text-muted-foreground"/> : <ArrowDown className="size-4 text-destructive"/>}</td></tr>)}</tbody></table></div>
        </section>

        <section className="analytics-section mt-4">
          <div className="section-heading"><div><p className="eyebrow">PRODUCER DIRECTORY</p><h2>Producer Intelligence Table</h2></div><div className="relative w-64 max-w-full"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"/><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" placeholder="ID producteur ou zone…"/></div></div>
          <div className="overflow-x-auto"><table className="producer-table producer-directory"><thead><tr>{[["id","Producer"],["zone","Zone"],["area","Plantation"],["production","Production"],["regularity","Regularity"],["quality","Quality"],["priority","Priority Score"],["risk","Risk Score"],["cluster","Cluster"],["lastDelivery","Last Delivery"],["status","Status"]].map(([key = "id",label = ""]) => <th key={key}>{["id","production","regularity","quality","priority","risk"].includes(key) ? <button type="button" onClick={() => { if (sortKey === key) setSortAsc((v) => !v); else { setSortKey(key as SortKey); setSortAsc(false); } }} className={sortKey === key ? "text-primary" : ""}>{label}<ChevronDown className="ml-1 inline size-3"/></button> : label}</th>)}</tr></thead><tbody>{pageRows.map((producer) => <tr key={producer.id} onClick={() => setSelected(producer)}><td className="font-mono font-medium">{producer.id}</td><td>{producer.zone}</td><td>{producer.area} ha</td><td>{producer.production} t</td><td>{producer.regularity}%</td><td>{producer.quality}%</td><td><ScoreCell value={producer.priority}/></td><td><RiskCell value={producer.risk}/></td><td><span className="segment-tag" style={{ borderColor: CLUSTER_COLOR[producer.cluster], color: CLUSTER_COLOR[producer.cluster] }}>{names[producer.cluster]}</span></td><td>{producer.lastDelivery} j</td><td><span className={`status-text status-${producer.status.toLowerCase()}`}>{producer.status}</span></td></tr>)}</tbody></table></div>
          <div className="table-footer"><span>{sorted.length.toLocaleString("fr-FR")} résultats · 10 par page</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="size-4"/></Button><span className="font-mono text-[10px]">{Math.min(page, pageCount)} / {pageCount}</span><Button variant="outline" size="icon" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}><ChevronRight className="size-4"/></Button></div></div>
        </section>

        <div className="engine-grid mt-4"><ScoringEngine/><SegmentationEngine pulse={analysisPulse} onRun={runAnalysis}/></div>
        <div className="model-grid mt-4"><ModelQuality/><KOptimization/><ProducerGeography producers={filtered.slice(0, 180)} names={names}/></div>

        <section className="analytics-section mt-4">
          <div className="section-heading"><div><p className="eyebrow">OPERATIONAL INSIGHTS</p><h2>Signaux calculés sur la sélection</h2></div><span className="text-[10px] text-muted-foreground">Générés depuis les données affichées</span></div>
          <div className="insights-grid">
            <Insight icon={Target} label="HIGH PRIORITY" value={highPriority} text="producteurs correspondent au seuil de priorité élevé pour la planification de collecte."/>
            <Insight icon={ShieldAlert} label="RISK" value={highRisk} text="producteurs présentent un score de risque élevé nécessitant une surveillance accrue." warning/>
            <Insight icon={Activity} label="REGULARITY" value={`${strategic?.regularity.toFixed(0) ?? 0}%`} text={`de régularité moyenne pour le segment ${names.strategic}.`}/>
            <Insight icon={TrendingUp} label="CAPACITY" value={`${strategic?.production.toFixed(1) ?? 0} t`} text={`de production moyenne dans le segment ${names.strategic}.`}/>
          </div>
          <div className="recommended-actions"><div><p className="eyebrow">RECOMMENDED ACTIONS</p><h3 className="mt-1 text-sm font-semibold">Priorités opérationnelles</h3></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm">Créer une liste de collecte</Button><Button variant="outline" size="sm">Planifier les contrôles qualité</Button><Button variant="outline" size="sm">Exporter la sélection</Button></div></div>
        </section>
        <footer className="flex items-center justify-between py-4 text-[9px] text-muted-foreground"><span>AGRIFLOW / PRODUCER INTELLIGENCE · SM10 CONNECT</span><span>DEMO DATA · NOT FOR OPERATIONAL DECISIONS</span></footer>
      </div>
    </main>

    <Sheet open={mobileNav} onOpenChange={setMobileNav}><SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0"><SheetTitle className="sr-only">Navigation AGRIFLOW</SheetTitle><AgriFlowNav active="module2" mobile/></SheetContent></Sheet>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>{selected && <ProducerDrawer producer={selected} name={names[selected.cluster]}/>}</Sheet>
  </div>;
}

function FilterBar(props: { zone: string; setZone: (v:string)=>void; cluster:string; setCluster:(v:string)=>void; priority:string; setPriority:(v:string)=>void; risk:string; setRisk:(v:string)=>void; productionMin:number; setProductionMin:(v:number)=>void; qualityMin:number; setQualityMin:(v:number)=>void; regularityMin:number; setRegularityMin:(v:number)=>void; onReset:()=>void }) {
  return <div className="filter-bar"><div className="flex items-center gap-2 pr-2"><Filter className="size-3.5 text-primary"/><span className="font-mono text-[9px]">FILTERS</span></div><CompactSelect label="Zone" value={props.zone} onChange={props.setZone} options={[["all","Toutes les zones"], ...ZONES.map(z => [z,z])]} /><CompactSelect label="Cluster" value={props.cluster} onChange={props.setCluster} options={[["all","Tous"], ...CLUSTERS.map(c => [c,CLUSTER_DEFAULTS[c]])]} /><CompactSelect label="Priority" value={props.priority} onChange={props.setPriority} options={[["all","All"],["high","High"],["medium","Medium"],["low","Low"]]} /><CompactSelect label="Risk" value={props.risk} onChange={props.setRisk} options={[["all","All"],["high","High"],["medium","Medium"],["low","Low"]]} /><NumberFilter label="Production ≥" value={props.productionMin} onChange={props.setProductionMin} suffix="t"/><NumberFilter label="Quality ≥" value={props.qualityMin} onChange={props.setQualityMin} suffix="%"/><NumberFilter label="Regularity ≥" value={props.regularityMin} onChange={props.setRegularityMin} suffix="%"/><Button variant="ghost" size="sm" onClick={props.onReset}><X className="size-3.5"/>Reset Filters</Button></div>;
}
function CompactSelect({ label, value, onChange, options }: { label:string; value:string; onChange:(v:string)=>void; options:string[][] }) { return <div className="compact-filter"><span>{label}</span><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{options.map(([v = "all",l = "All"]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>; }
function NumberFilter({ label, value, onChange, suffix }: { label:string; value:number; onChange:(v:number)=>void; suffix:string }) { return <label className="number-filter"><span>{label}</span><input type="number" min="0" max="100" value={value} onChange={(e)=>onChange(Number(e.target.value))}/><b>{suffix}</b></label>; }
function KpiLine({ index }: { index:number }) { const paths = ["M0 32L16 29L30 30L45 22L60 25L76 17L91 19L110 9", "M0 28L18 26L33 21L49 23L65 16L83 17L110 11", "M0 31L22 29L40 24L60 18L78 20L96 12L110 13"]; return <svg viewBox="0 0 110 35" preserveAspectRatio="none" className="executive-spark"><path d={paths[index%3]} fill="none" stroke="var(--color-primary)" strokeWidth="1.4"/></svg>; }
function SegmentBar({ segment, total, name, editing, onName }: { segment:{id:ClusterId;count:number;production:number;regularity:number;quality:number;priority:number;risk:number}; total:number; name:string; editing:boolean; onName:(v:string)=>void }) { const pct = segment.count/total*100; return <div className="segment-row"><div className="flex items-center justify-between gap-3">{editing ? <Input className="h-7 w-32" value={name} onChange={(e)=>onName(e.target.value)}/> : <span className="flex items-center gap-2 text-xs font-medium"><i className="size-2 rounded-full" style={{background:CLUSTER_COLOR[segment.id]}}/>{name}</span>}<span className="font-mono text-[10px] text-muted-foreground">{segment.count} · {pct.toFixed(1)}%</span></div><div className="segment-track"><span style={{width:`${pct}%`,background:CLUSTER_COLOR[segment.id]}}/></div><div className="grid grid-cols-3 gap-2 text-[9px] text-muted-foreground"><span>AVG VOL <b>{segment.production.toFixed(1)}t</b></span><span>REG <b>{segment.regularity.toFixed(0)}%</b></span><span>SCORE <b>{segment.priority.toFixed(0)}</b></span></div></div>; }
function ScatterPlot({ producers, colorMode, hovered, setHovered, names }: { producers:Producer[]; colorMode:ColorMode; hovered:Producer|null; setHovered:(p:Producer|null)=>void; names:Record<ClusterId,string> }) {
  const color = (p:Producer) => colorMode === "Cluster" ? CLUSTER_COLOR[p.cluster] : colorMode === "Geographic Zone" ? ZONE_COLORS[Math.max(0,ZONES.indexOf(p.zone))] : colorMode === "Priority Score" ? p.priority>70 ? "var(--color-primary)" : p.priority>45 ? "var(--color-secondary-route)" : "var(--color-muted-foreground)" : p.risk>70 ? "var(--color-destructive)" : p.risk>45 ? "var(--color-secondary-route)" : "var(--color-chart-3)";
  const toPoint = (p:Producer) => ({ x: 58 + (p.production / 60) * 560, y: 270 - (p.regularity / 100) * 238 });
  const hulls = CLUSTERS.map((id) => {
    const rows = producers.filter((producer) => producer.cluster === id);
    if (!rows.length) return null;
    const xs = rows.map((producer) => toPoint(producer).x);
    const ys = rows.map((producer) => toPoint(producer).y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return { id, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, rx: Math.max(26, (maxX - minX) / 2 + 18), ry: Math.max(18, (maxY - minY) / 2 + 12) };
  }).filter((hull): hull is { id: ClusterId; cx: number; cy: number; rx: number; ry: number } => Boolean(hull));
  return <div className="scatter-wrap"><svg viewBox="0 0 660 320" className="scatter-chart" aria-label="Carte des clusters de producteurs"><defs><filter id="scatterGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect x="58" y="22" width="560" height="248" className="chart-plot-bg"/><g className="chart-grid">{[35,82,129,176,223,270].map((y,i)=><g key={y}><line x1="58" x2="618" y1={y} y2={y}/><text x="46" y={y+3} textAnchor="end" className="chart-tick">{100-i*20}</text></g>)}{[58,170,282,394,506,618].map((x,i)=><g key={x}><line x1={x} x2={x} y1="22" y2="270"/><text x={x} y="288" textAnchor="middle" className="chart-tick">{i*12}</text></g>)}</g>{hulls.map((hull)=><ellipse key={hull.id} cx={hull.cx} cy={hull.cy} rx={hull.rx} ry={hull.ry} fill={CLUSTER_COLOR[hull.id]} className="cluster-density"/>)}<line x1="58" x2="618" y1="270" y2="270" className="chart-axis"/><line x1="58" x2="58" y1="22" y2="270" className="chart-axis"/>{producers.map(p=>{ const point=toPoint(p); return <circle key={p.id} cx={point.x} cy={point.y} r={hovered?.id===p.id?5.8:2.8} fill={color(p)} opacity={hovered && hovered.id!==p.id?.38:.76} onMouseEnter={()=>setHovered(p)} onMouseLeave={()=>setHovered(null)} className="scatter-point" filter={hovered?.id===p.id?"url(#scatterGlow)":undefined}/>; })}<text x="338" y="309" textAnchor="middle" className="chart-label">PRODUCTION VOLUME (T)</text><text x="16" y="156" textAnchor="middle" transform="rotate(-90 16 156)" className="chart-label">DELIVERY REGULARITY</text></svg><div className="scatter-legend">{CLUSTERS.map((id)=><span key={id}><i style={{background:CLUSTER_COLOR[id]}}/>{names[id]}</span>)}</div>{hovered && <div className="scatter-tooltip"><div className="flex justify-between gap-3"><b className="font-mono">{hovered.id}</b><span>{names[hovered.cluster]}</span></div><div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1"><span>Zone <b>{hovered.zone}</b></span><span>Production <b>{hovered.production} t</b></span><span>Regularity <b>{hovered.regularity}%</b></span><span>Quality <b>{hovered.quality}%</b></span><span>Priority <b>{hovered.priority}</b></span><span>Risk <b>{hovered.risk}</b></span></div></div>}</div>;
}
function ScoreCell({ value }: { value:number }) { return <span className="score-cell"><i style={{width:`${value}%`}}/>{value.toFixed(0)}</span>; }
function RiskCell({ value }: { value:number }) { return <span className={`risk-cell risk-${levelFor(value).toLowerCase()}`}>{levelFor(value)} · {value.toFixed(0)}</span>; }
function ScoringEngine() { const [weights,setWeights]=useState([30,25,25,20]); const labels=["Production Capacity","Delivery Regularity","Quality","Strategic Proximity"]; return <section className="analytics-section"><div className="section-heading"><div><p className="eyebrow">SCORING ENGINE</p><h2>Priority & Risk Scores</h2></div><SlidersHorizontal className="size-4 text-muted-foreground"/></div><div className="score-engine-grid"><div><div className="engine-score"><span>PRIORITY SCORE</span><b>91 <small>/ 100</small></b></div>{labels.map((label,i)=><label className="weight-row" key={label}><span>{label}</span><input type="range" min="0" max="60" value={weights[i]} onChange={(e)=>setWeights(w=>w.map((v,j)=>j===i?Number(e.target.value):v))}/><b>{weights[i]}%</b></label>)}</div><div><div className="engine-score risk"><span>RISK SCORE</span><b>18 <small>/ 100</small></b></div>{["Production Variability","Delivery Irregularity","Quality Variability","Data Reliability"].map((label,i)=><div className="weight-row static" key={label}><span>{label}</span><div><i style={{width:`${[35,30,20,15][i]}%`}}/></div><b>{[35,30,20,15][i]}%</b></div>)}</div></div><p className="method-note">Pondérations de démonstration uniquement — elles ne constituent pas une méthodologie scientifique validée.</p></section>; }
function SegmentationEngine({pulse,onRun}:{pulse:boolean;onRun:()=>void}) { return <section className="analytics-section"><div className="section-heading"><div><p className="eyebrow">SEGMENTATION ENGINE</p><h2>Model Configuration</h2></div><span className="status-pill status-positive"><i className="size-1.5 rounded-full bg-current"/>READY</span></div><dl className="config-grid"><div><dt>Algorithm</dt><dd>K-MEANS</dd></div><div><dt>Clusters</dt><dd>4</dd></div><div><dt>Normalization</dt><dd>Z-SCORE</dd></div><div><dt>Last Run</dt><dd>22 Sep 2026</dd></div><div className="col-span-2"><dt>Features</dt><dd>Production · Regularity · Quality · Area · Distance</dd></div></dl><Button className="mt-5 w-full" onClick={onRun}><RefreshCw className={`size-3.5 ${pulse?"animate-spin":""}`}/>RUN SEGMENTATION</Button><p className="method-note">Architecture prête à recevoir ultérieurement les métriques calculées par Python/scikit-learn.</p></section>; }
function ModelQuality(){return <section className="analytics-section"><div className="section-heading"><div><p className="eyebrow">SEGMENTATION QUALITY</p><h2>Model Health</h2></div><span className="demo-dot">DEMO</span></div><div className="quality-grid">{[["Silhouette Score","0.71"],["Inertia","428.6"],["Clusters","4"],["Stability","92%"]].map(([l,v])=><div key={l}><span>{l}</span><b>{v}</b></div>)}</div><p className="method-note">Metrics shown for demonstration purposes.</p></section>}
function KOptimization(){const max=800;return <section className="analytics-section"><div className="section-heading"><div><p className="eyebrow">K OPTIMIZATION</p><h2>Optimal Number of Clusters</h2></div><span className="font-mono text-[9px] text-primary">K = 4</span></div><svg viewBox="0 0 380 160" className="k-chart"><g className="chart-grid">{[30,70,110].map(y=><line key={y} x1="30" x2="360" y1={y} y2={y}/>)}</g><polyline points={ELBOW.map((d,i)=>`${45+i*72},${140-d.inertia/max*120}`).join(" ")} fill="none" stroke="var(--color-primary)" strokeWidth="2"/>{ELBOW.map((d,i)=><g key={d.k}><circle cx={45+i*72} cy={140-d.inertia/max*120} r={d.k===4?6:3.5} fill={d.k===4?"var(--color-primary)":"var(--color-background)"} stroke="var(--color-primary)"/><text x={45+i*72} y="154" textAnchor="middle" className="chart-label">K{d.k}</text></g>)}</svg><div className="silhouette-row">{ELBOW.map(d=><div key={d.k}><span>K{d.k}</span><i><b style={{width:`${d.silhouette*100}%`}}/></i><strong>{d.silhouette}</strong></div>)}</div></section>}
function ProducerGeography({producers,names}:{producers:Producer[];names:Record<ClusterId,string>}){const centers=[{name:"Ziguinchor",x:92,y:166},{name:"Bignona",x:154,y:98},{name:"Bambali",x:250,y:137},{name:"Sédhiou",x:315,y:124},{name:"Kolda",x:390,y:173},{name:"Vélingara",x:448,y:151}];return <section className="analytics-section geography"><div className="section-heading"><div><p className="eyebrow">GEOGRAPHIC INTELLIGENCE</p><h2>Producer Geography</h2></div><span className="demo-badge">SIMULATED POSITIONS</span></div><div className="geo-map"><svg viewBox="0 0 520 260" aria-label="Répartition simulée des producteurs en Casamance"><defs><radialGradient id="densityGreen"><stop offset="0" stopColor="var(--color-primary)" stopOpacity=".34"/><stop offset="1" stopColor="var(--color-primary)" stopOpacity="0"/></radialGradient><radialGradient id="densityAmber"><stop offset="0" stopColor="var(--color-secondary-route)" stopOpacity=".28"/><stop offset="1" stopColor="var(--color-secondary-route)" stopOpacity="0"/></radialGradient><linearGradient id="riverGradient" x1="0" x2="1"><stop offset="0" stopColor="var(--color-map-river)" stopOpacity=".48"/><stop offset="1" stopColor="var(--color-map-river-soft)" stopOpacity=".68"/></linearGradient></defs><rect width="520" height="260" className="geo-bg"/><path d="M28 115C72 70 119 56 171 67C219 78 245 103 286 89C341 70 367 66 408 81C440 92 469 82 493 101L478 208C430 197 391 217 343 201C292 184 254 203 212 190C169 177 137 159 96 169C64 177 42 163 27 146Z" className="geo-land"/><path d="M10 159C57 143 102 147 148 158C191 169 227 164 268 144C319 119 369 143 413 137C450 132 479 121 510 107" className="geo-river-main"/><path d="M96 155C111 135 124 120 145 101" className="geo-river-branch"/><path d="M276 143C291 126 305 112 322 99" className="geo-river-branch"/><path d="M86 167C133 130 191 125 251 137C312 149 362 160 447 151" className="geo-road major"/><path d="M88 166C143 188 212 186 279 160C325 142 372 139 450 152" className="geo-road secondary"/><path d="M151 99C194 112 214 123 250 137C294 154 338 169 390 174" className="geo-road secondary"/><path d="M250 137C266 128 286 126 315 124" className="geo-road connector"/><path d="M39 210L488 210" className="geo-scale"/><text x="39" y="226" className="geo-note">SCHÉMA GÉOSPATIAL SIMULÉ · COORDONNÉES INDICATIVES</text>{centers.map((center)=><circle key={`${center.name}-density`} cx={center.x} cy={center.y} r={center.name==="Bambali"?46:36} fill="url(#densityGreen)"/>)}<circle cx="154" cy="98" r="28" fill="url(#densityAmber)"/><circle cx="390" cy="173" r="31" fill="url(#densityAmber)"/>{producers.map(p=><circle key={p.id} cx={p.x/100*480+20} cy={p.y/100*200+30} r={p.priority>70?2.7:1.65} fill={CLUSTER_COLOR[p.cluster]} opacity={p.priority>70?.88:.58}/>)}{centers.map((center)=><g key={center.name}><circle cx={center.x} cy={center.y} r="3.2" className="geo-city"/><text x={center.x+6} y={center.y-7} className="geo-label">{center.name}</text></g>)}<text x="252" y="130" className="geo-hub">SM10 Bambali</text></svg><div className="geo-legend"><span><i className="bg-primary"/>Densité producteurs</span><span><i className="bg-secondary-route"/>Densité priorité haute</span><span><i style={{background:"var(--color-chart-3)"}}/>{names.regular}</span></div></div></section>}
function Insight({icon:Icon,label,value,text,warning}:{icon:typeof Target;label:string;value:number|string;text:string;warning?:boolean}){return <article className="insight"><span className={warning?"text-secondary-route":"text-primary"}><Icon className="size-4"/></span><div><p className="font-mono text-[9px] text-muted-foreground">{label}</p><p className="mt-1 text-xs leading-relaxed"><b className="font-mono text-base">{value}</b> {text}</p></div></article>}
function ProducerDrawer({producer,name}:{producer:Producer;name:string}){return <SheetContent side="right" className="producer-drawer w-full overflow-y-auto border-border bg-background sm:max-w-xl"><SheetTitle className="text-lg">Producer Intelligence Profile</SheetTitle><p className="mt-1 text-xs text-muted-foreground">Données simulées · Profil de démonstration</p><div className="profile-id"><div><span>PRODUCER ID</span><b>{producer.id}</b></div><div><span>ZONE</span><b>{producer.zone}</b></div><div><span>CLUSTER</span><b>{name}</b></div></div><div className="profile-scores"><ProfileScore label="PRIORITY SCORE" value={producer.priority}/><ProfileScore label="RISK SCORE" value={producer.risk} risk/><ProfileScore label="DATA CONFIDENCE" value={producer.confidence}/></div><ProfileSection title="Production Profile" rows={[["Plantation Area",`${producer.area} ha`],["Average Volume",`${producer.production} t`],["Volume Variability",`${producer.productionVariability}%`]]}/><ProfileSection title="Delivery Profile" rows={[["Deliveries",String(producer.deliveries)],["Regularity",`${producer.regularity}%`],["Average Delay",`${producer.delay} day`]]}/><ProfileSection title="Quality Profile" rows={[["Average Quality",`${producer.quality}%`],["Quality Variability",`${producer.qualityVariability}%`]]}/><div className="profile-section"><h3>Producer Performance — Last 12 Months</h3><HistoryChart producer={producer}/></div></SheetContent>}
function ProfileScore({label,value,risk}:{label:string;value:number;risk?:boolean}){return <div><span>{label}</span><b className={risk&&value>50?"text-destructive":"text-primary"}>{value} <small>/ 100</small></b><i><em style={{width:`${value}%`}} className={risk?"bg-destructive":"bg-primary"}/></i></div>}
function ProfileSection({title,rows}:{title:string;rows:string[][]}){return <div className="profile-section"><h3>{title}</h3><dl>{rows.map(([l,v])=><div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}</dl></div>}
function HistoryChart({producer}:{producer:Producer}){const pts=producer.history.map((h,i)=>`${20+i*42},${120-h.production/60*90}`).join(" ");return <svg viewBox="0 0 500 150" className="history-chart"><g className="chart-grid">{[30,70,110].map(y=><line key={y} x1="20" x2="482" y1={y} y2={y}/>)}</g><polyline points={pts} fill="none" stroke="var(--color-primary)" strokeWidth="2"/>{producer.history.map((h,i)=><g key={h.month}><circle cx={20+i*42} cy={120-h.production/60*90} r="3" fill="var(--color-primary)"/><text x={20+i*42} y="142" textAnchor="middle" className="chart-label">{h.month}</text></g>)}</svg>}
function avg(rows:Producer[],key:"production"|"regularity"|"quality"|"priority"|"risk"){return rows.length?rows.reduce((sum,row)=>sum+row[key],0)/rows.length:0;}
