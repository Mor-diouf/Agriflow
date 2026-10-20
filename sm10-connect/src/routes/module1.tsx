import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Bell, ChevronDown, Clock3, Factory, Gauge, Leaf, Menu, MoreHorizontal, Route as RouteIcon, Search, ShieldCheck, SlidersHorizontal, Truck, UsersRound, Wifi, X } from "lucide-react";
import { CarteTournees, type MapFilter } from "@/components/CarteTournees";
import { Button } from "@/components/ui/button";
import { CAMIONS, JOURNAL, KPI, type Camion } from "@/lib/module1-data";

export const Route = createFileRoute("/module1")({
  head: () => ({ meta: [
    { title: "Centre de commandement | AgriFlow Casamance" },
    { name: "description", content: "Pilotage en temps réel des tournées de collecte de mangues, de la flotte et des volumes en Casamance." },
    { property: "og:title", content: "Centre de commandement | AgriFlow Casamance" },
    { property: "og:description", content: "Carte opérationnelle, indicateurs logistiques et suivi de flotte pour la collecte de mangues en Casamance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Module1,
});

const FILTERS: MapFilter[] = ["Toutes", "Optimisées", "Alternatives", "Retards", "Alertes"];
const SPARKS: [number[], number[], number[], number[], number[]] = [
  [26, 30, 27, 35, 39, 43, 50, 47, 58, 63, 68, 74],
  [71, 68, 69, 61, 59, 55, 51, 53, 45, 42, 38, 34],
  [52, 55, 59, 57, 64, 67, 70, 72, 76, 78, 82, 85],
  [78, 75, 74, 68, 66, 61, 57, 54, 48, 45, 40, 36],
  [41, 48, 44, 53, 58, 61, 65, 69, 75, 78, 82, 88],
];

function Module1() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<MapFilter>("Toutes");
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"id" | "arrivee" | "charge" | "priorite">("id");

  const sortedTrucks = useMemo(() => [...CAMIONS].sort((a, b) => {
    if (sortKey === "charge") return b.charge / b.capacite - a.charge / a.capacite;
    if (sortKey === "priorite") return priorityRank(b.priorite) - priorityRank(a.priorite);
    return a[sortKey].localeCompare(b[sortKey]);
  }), [sortKey]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="command-header sticky top-0 z-40">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Ouvrir le menu"><Menu /></Button>
          <div className="brand-mark"><Leaf className="size-4" /></div>
          <div className="min-w-0"><p className="truncate font-display text-sm font-semibold">AGRIFLOW <span className="text-primary">/ OPS</span></p><p className="truncate text-[10px] text-muted-foreground">Casamance Logistics Network</p></div>
          <span className="header-divider hidden sm:block" />
          <div className="hidden items-center gap-2 sm:flex"><span className="relative flex size-2"><span className="absolute size-full animate-ping rounded-full bg-optimized opacity-50"/><span className="relative size-2 rounded-full bg-optimized"/></span><span className="text-xs font-medium">Système opérationnel</span></div>
        </div>
        <div className="hidden min-w-0 items-center justify-center gap-2 lg:flex">
          <span className="font-mono text-[10px] text-muted-foreground">SYNC 18:43:18 GMT</span>
          <span className="size-1 rounded-full bg-border"/>
          <span className="text-xs text-muted-foreground">Lundi 21 septembre 2026</span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <label className="hidden h-8 w-52 items-center gap-2 border border-input bg-surface/60 px-2.5 xl:flex"><Search className="size-3.5 text-muted-foreground"/><input aria-label="Rechercher" className="min-w-0 flex-1 bg-transparent text-xs outline-hidden placeholder:text-muted-foreground" placeholder="Véhicule, producteur…"/></label>
          <Button variant="ghost" size="icon" className="relative size-8" title="Notifications"><Bell className="size-4"/><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-secondary-route"/><span className="sr-only">Notifications</span></Button>
          <div className="hidden items-center gap-2 border-l border-border pl-3 sm:flex"><span className="grid size-7 place-items-center rounded-full bg-accent font-mono text-[10px] font-bold">MD</span><span className="text-xs"><b className="block">Mor Diouf</b><span className="text-muted-foreground">Administrateur</span></span><ChevronDown className="size-3 text-muted-foreground"/></div>
        </div>
      </header>

      <aside className={`command-rail ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <Button variant="ghost" size="icon" className="absolute right-3 top-3 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Fermer le menu"><X /></Button>
        <div className="pt-14 lg:pt-1">
          <p className="label-xs mb-4">Module 01</p>
          <h1 className="text-xl font-semibold leading-tight">Optimisation<br/>des tournées</h1>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Wifi className="size-3.5 text-primary"/>12 points connectés</div>
          <div className="mt-5 grid grid-cols-2 gap-1 border border-sidebar-border bg-sidebar-accent/30 p-1">
            <Link to="/module1" className="flex min-h-9 items-center justify-center gap-2 bg-primary/10 text-[10px] font-medium text-primary"><RouteIcon className="size-3.5"/>Module 01</Link>
            <Link to="/module2" className="flex min-h-9 items-center justify-center gap-2 text-[10px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"><UsersRound className="size-3.5"/>Module 02</Link>
          </div>
        </div>

        <ForecastHandoff />
        <div className="rail-section">
          <p className="label-xs">Vue réseau</p>
          <div className="mt-3 space-y-1">
            {FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`filter-row ${filter === item ? "filter-row-active" : ""}`}>
              <span className={`size-1.5 rounded-full ${item === "Alertes" ? "bg-destructive" : item === "Alternatives" || item === "Retards" ? "bg-secondary-route" : "bg-optimized"}`}/>
              <span>{item}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{filterCount(item)}</span>
            </button>)}
          </div>
        </div>

        <div className="rail-section grid grid-cols-2 gap-x-3 gap-y-5">
          <RailMetric label="Temps total" value={KPI.tempsTotal} accent />
          <RailMetric label="Capacité" value={`${KPI.capaciteMoy}%`} />
          <RailMetric label="Pertes évitées" value={`${KPI.pertesEvitees}%`} accent />
          <RailMetric label="À risque / 24h" value={`${KPI.pertesEstimees} t`} warning />
        </div>

        <div className="rail-section min-h-0 flex-1">
          <div className="flex items-center justify-between"><p className="label-xs">Journal opérationnel</p><span className="live-label">LIVE</span></div>
          <div className="mt-4 space-y-4">{JOURNAL.map((event, index) => <div key={`${event.camion}-${index}`} className="activity-item animate-fade-in" style={{ animationDelay: `${index * 80}ms` }}><span className={`mt-1 size-1.5 shrink-0 rounded-full ${event.optimisee ? "bg-optimized" : "bg-secondary-route"}`}/><div className="min-w-0"><div className="flex items-center justify-between gap-2"><b className="font-mono text-[10px]">{event.camion}</b><span className="font-mono text-[9px] text-muted-foreground">{event.km}</span></div><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{event.texte}</p></div></div>)}</div>
        </div>
      </aside>

      <main className="command-main">
        <section className="kpi-strip">
          <KpiCard icon={Factory} label="Volume planifié" value={KPI.volumeCollecte.toFixed(1)} unit="t" delta="+6,2 %" trend="up" detail="sur 198,0 t" spark={SPARKS[0]} />
          <KpiCard icon={RouteIcon} label="Distance totale" value={String(KPI.distanceTotale)} unit="km" delta="−12,8 %" trend="down" detail="143 km économisés" spark={SPARKS[1]} />
          <KpiCard icon={Gauge} label="Taux de service" value="96,3" unit="%" delta="+3,1 %" trend="up" detail="fenêtres respectées" spark={SPARKS[2]} />
          <KpiCard icon={Clock3} label="Temps total" value="15:42" unit="h" delta="−2 h 19" trend="down" detail="vs plan initial" spark={SPARKS[3]} />
          <KpiCard icon={ShieldCheck} label="Pertes évitées" value="94,2" unit="%" delta="+4,6 %" trend="up" detail="qualité préservée" spark={SPARKS[4]} />
        </section>

        <section className="map-shell">
          <div className="map-toolbar">
            <div className="min-w-0"><p className="label-xs">Situation opérationnelle</p><h2 className="mt-1 truncate text-base font-semibold">Réseau de collecte · Casamance</h2></div>
            <div className="hidden items-center gap-1 md:flex">{FILTERS.map((item) => <Button key={item} variant={filter === item ? "secondary" : "ghost"} size="sm" className="h-8 text-xs" onClick={() => setFilter(item)}>{item}</Button>)}</div>
            <Button variant="outline" size="sm" className="h-8 shrink-0"><SlidersHorizontal className="size-3.5"/>Filtres</Button>
          </div>
          <CarteTournees filter={filter} selectedTruck={selectedTruck} onSelectTruck={setSelectedTruck}/>
          <div className="map-statusbar"><span><i className="bg-optimized"/>4 itinéraires optimisés</span><span><i className="bg-secondary-route"/>2 alternatives</span><span className="ml-auto hidden font-mono sm:inline">GPS ± 4 m · Données il y a 42 s</span></div>
        </section>

        <section className="fleet-panel">
          <div className="fleet-heading"><div><p className="label-xs">Flotte active</p><h2 className="mt-1 text-base font-semibold">6 véhicules en opération</h2></div><div className="flex items-center gap-2"><span className="hidden text-xs text-muted-foreground sm:inline">Sélectionnez une ligne pour isoler sa tournée</span>{selectedTruck && <Button variant="outline" size="sm" onClick={() => setSelectedTruck(null)}>Réinitialiser</Button>}</div></div>
          <div className="overflow-x-auto">
            <table className="fleet-table">
              <thead><tr><SortHead label="Véhicule" active={sortKey === "id"} onClick={() => setSortKey("id")}/><th>Chauffeur & itinéraire</th><SortHead label="Arrivée" active={sortKey === "arrivee"} onClick={() => setSortKey("arrivee")}/><SortHead label="Chargement" active={sortKey === "charge"} onClick={() => setSortKey("charge")}/><th>État</th><SortHead label="Priorité" active={sortKey === "priorite"} onClick={() => setSortKey("priorite")}/><th/></tr></thead>
              <tbody>{sortedTrucks.map((truck) => <FleetRow key={truck.id} truck={truck} selected={selectedTruck === truck.id} onSelect={() => setSelectedTruck(selectedTruck === truck.id ? null : truck.id)} />)}</tbody>
            </table>
          </div>
        </section>
        <footer className="flex items-center justify-between py-3 text-[10px] text-muted-foreground"><span>AGRIFLOW OPS · SM10 Agro, Bambali</span><span>Données simulées pour démonstration</span></footer>
      </main>
      {menuOpen && <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-40 bg-overlay lg:hidden" onClick={() => setMenuOpen(false)}/>} 
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, unit, delta, trend, detail, spark }: { icon: typeof Truck; label: string; value: string; unit: string; delta: string; trend: "up" | "down"; detail: string; spark: number[] }) {
  return <article className="kpi-card">
    <div className="relative z-10 flex items-start justify-between"><span className="kpi-icon"><Icon className="size-4"/></span><span className="status-pill status-positive">{trend === "up" ? <ArrowUp className="size-3"/> : <ArrowDown className="size-3"/>}{delta}</span></div>
    <MiniSpark values={spark}/>
    <div className="relative z-10 mt-4"><p className="label-xs">{label}</p><p className="mt-1 flex items-baseline gap-1.5 font-mono"><span className="metric animate-count-in">{value}</span><span className="text-xs text-muted-foreground">{unit}</span></p><p className="mt-1 text-[10px] text-muted-foreground">{detail}</p></div>
  </article>;
}

function MiniSpark({ values }: { values: number[] }) {
  const points = values.map((value, index) => `${index * (120 / (values.length - 1))},${52 - (value / 100) * 42}`).join(" ");
  return <svg viewBox="0 0 120 52" preserveAspectRatio="none" className="sparkline" aria-hidden="true"><defs><linearGradient id={`spark-${values[0]}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--color-route-green)" stopOpacity=".28"/><stop offset="1" stopColor="var(--color-route-green)" stopOpacity="0"/></linearGradient></defs><polygon points={`0,52 ${points} 120,52`} fill={`url(#spark-${values[0]})`}/><polyline points={points} fill="none" stroke="var(--color-route-green)" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></svg>;
}

function RailMetric({ label, value, accent, warning }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return <div><p className="text-[10px] text-muted-foreground">{label}</p><p className={`mt-1 font-mono text-base font-semibold ${accent ? "text-primary" : warning ? "text-secondary-route" : "text-foreground"}`}>{value}</p></div>;
}

function SortHead({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <th><button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-primary" : ""}`}>{label}<ChevronDown className="size-3"/></button></th>;
}

function FleetRow({ truck, selected, onSelect }: { truck: Camion; selected: boolean; onSelect: () => void }) {
  const load = Math.round(truck.charge / truck.capacite * 100);
  return <tr onClick={onSelect} className={selected ? "fleet-row-selected" : ""}>
    <td><div className="flex items-center gap-2"><span className={`vehicle-avatar ${truck.optimisee ? "vehicle-optimized" : "vehicle-alternative"}`}><Truck className="size-4"/></span><span className="font-mono font-semibold">{truck.id}</span></div></td>
    <td><p className="font-medium">{truck.chauffeur}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{truck.itineraire}</p></td>
    <td><p className="font-mono font-semibold">{truck.arrivee}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{truck.duree}</p></td>
    <td><div className="flex min-w-36 items-center gap-2"><div className="load-track"><span className={truck.optimisee ? "load-optimized" : "load-alternative"} style={{ width: `${load}%` }}/></div><span className="w-9 font-mono text-[10px]">{load}%</span></div></td>
    <td><span className={`status-pill ${truck.statut === "En route" ? "status-positive" : "status-warning"}`}><i className="size-1.5 rounded-full bg-current"/>{truck.statut}</span></td>
    <td><span className={`priority priority-${truck.priorite.toLowerCase()}`}>{truck.priorite}</span></td>
    <td><Button variant="ghost" size="icon" className="size-7" onClick={(event) => event.stopPropagation()} aria-label={`Actions ${truck.id}`}><MoreHorizontal className="size-4"/></Button></td>
  </tr>;
}

function filterCount(filter: MapFilter) {
  if (filter === "Toutes") return "06";
  if (filter === "Optimisées") return "04";
  if (filter === "Alternatives" || filter === "Retards") return "02";
  return "01";
}

function priorityRank(priority: Camion["priorite"]) {
  return priority === "Critique" ? 3 : priority === "Haute" ? 2 : 1;
}
function ForecastHandoff() {
  const [data, setData] = useState<{ period: string; zones: { name: string; s4: number; uncertainty: number }[] } | null>(null);
  useEffect(() => { try { const raw = sessionStorage.getItem("agriflow.forecastHandoff"); if (raw) setData(JSON.parse(raw)); } catch { setData(null); } }, []);
  if (!data) return null;
  return <div className="rail-section border border-primary/30 bg-primary/5 p-3">
    <div className="flex items-center justify-between"><p className="label-xs text-primary">Entrée Module 03</p><button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Retirer" onClick={() => { sessionStorage.removeItem("agriflow.forecastHandoff"); setData(null); }}><X className="size-3.5"/></button></div>
    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{data.period} · SIMULÉ</p>
    <ul className="mt-2 space-y-1 text-xs">{data.zones.map((z) => <li key={z.name} className="flex justify-between"><span>{z.name}</span><span className="font-mono">{Math.round(z.s4)} t ±{z.uncertainty}</span></li>)}</ul>
  </div>;
}
