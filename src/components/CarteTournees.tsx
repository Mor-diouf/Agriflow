import { useMemo, useState } from "react";
import { Layers3, LocateFixed, Minus, Plus, Route, Satellite, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAMIONS, FERMES, USINE, type Camion, type Ferme } from "@/lib/module1-data";

const W = 1200;
const H = 680;
const sx = (x: number) => (x / 100) * W;
const sy = (y: number) => (y / 100) * H;

export type MapFilter = "Toutes" | "Optimisées" | "Alternatives" | "Retards" | "Alertes";
type LayerMode = "terrain" | "satellite" | "logistique";

const ROAD_NETWORK = [
  { id: "n4-west", d: "M82 178 C148 164 208 190 270 248 C338 312 435 333 535 342 C608 348 661 316 696 286", major: true },
  { id: "n4-south", d: "M270 248 C246 317 254 376 300 415 C373 474 464 457 535 342", major: true },
  { id: "n6-east", d: "M535 342 C635 362 698 408 804 417 C916 426 1038 460 1125 500", major: true },
  { id: "bambali-north", d: "M696 286 C742 246 832 210 931 211", major: false },
  { id: "goudomp", d: "M535 342 C560 425 611 491 746 522", major: false },
  { id: "bounkiling", d: "M696 286 C676 224 683 174 688 130", major: false },
  { id: "coast", d: "M82 178 C99 248 137 318 270 415", major: false },
  { id: "kolda-north", d: "M804 417 C864 344 889 278 931 211", major: false },
];

const ROUTE_PATHS = [
  { id: "TRK-001", d: "M228 204 C314 270 427 324 535 342 C600 350 654 320 696 286", optimized: true },
  { id: "TRK-002", d: "M684 394 C692 350 698 316 696 286", optimized: true },
  { id: "TRK-003", d: "M948 415 C850 402 756 357 696 286", optimized: false },
  { id: "TRK-004", d: "M540 367 C604 359 660 326 696 286", optimized: true },
  { id: "TRK-005", d: "M1104 469 C971 444 826 383 696 286", optimized: false },
  { id: "TRK-006", d: "M600 476 C631 403 658 341 696 286", optimized: true },
];

const TRUCK_POSITIONS = [
  { id: "TRK-001", x: 39, y: 45, angle: 14 },
  { id: "TRK-002", x: 57, y: 52, angle: -74 },
  { id: "TRK-003", x: 71, y: 58, angle: -161 },
  { id: "TRK-004", x: 50, y: 52, angle: -17 },
  { id: "TRK-005", x: 82, y: 64, angle: -165 },
  { id: "TRK-006", x: 54, y: 65, angle: -61 },
];

type CarteTourneesProps = {
  filter: MapFilter;
  selectedTruck: string | null;
  onSelectTruck: (id: string | null) => void;
};

export function CarteTournees({ filter, selectedTruck, onSelectTruck }: CarteTourneesProps) {
  const [activeFarm, setActiveFarm] = useState<Ferme | null>(null);
  const [hoveredTruck, setHoveredTruck] = useState<Camion | null>(null);
  const [zoom, setZoom] = useState(1);
  const [layer, setLayer] = useState<LayerMode>("terrain");

  const visibleRouteIds = useMemo(() => new Set(CAMIONS.filter((truck) => {
    if (filter === "Optimisées") return truck.optimisee;
    if (filter === "Alternatives") return !truck.optimisee;
    if (filter === "Retards") return truck.id === "TRK-003" || truck.id === "TRK-005";
    if (filter === "Alertes") return truck.priorite === "Critique";
    return true;
  }).map((truck) => truck.id)), [filter]);

  const viewTransform = `translate(${(1 - zoom) * W / 2} ${(1 - zoom) * H / 2}) scale(${zoom})`;
  const showRoute = (id: string) => visibleRouteIds.has(id) && (!selectedTruck || selectedTruck === id);

  return (
    <div className={`relative h-full min-h-[560px] w-full overflow-hidden bg-map map-layer-${layer}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" aria-label="Carte opérationnelle des tournées en Casamance">
        <defs>
          <pattern id="map-grid-premium" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="var(--color-map-grid)" strokeWidth="1" />
          </pattern>
          <pattern id="orchards" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
            <path d="M0 13H26" stroke="var(--color-map-land)" strokeWidth="5" opacity=".22" />
          </pattern>
          <linearGradient id="active-green" x1="0" x2="1"><stop stopColor="var(--color-route-green-deep)"/><stop offset=".55" stopColor="var(--color-route-green)"/><stop offset="1" stopColor="var(--color-route-green-bright)"/></linearGradient>
          <linearGradient id="active-amber" x1="0" x2="1"><stop stopColor="var(--color-route-amber-deep)"/><stop offset="1" stopColor="var(--color-route-amber)"/></linearGradient>
          <filter id="route-glow-premium"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="truck-shadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="var(--color-map-shadow)" floodOpacity=".8"/></filter>
        </defs>

        <g transform={viewTransform} className="transition-transform duration-500">
          <rect width={W} height={H} fill="url(#map-grid-premium)" />
          <path d="M0 75 C170 17 310 56 424 112 C549 174 661 83 805 94 C970 106 1110 55 1200 92 L1200 610 C1054 631 937 579 802 590 C639 603 533 625 378 585 C213 544 105 594 0 548Z" fill="var(--color-map-land)" opacity=".1" />
          <path d="M28 98 C158 72 278 101 397 145 L352 279 C230 251 141 254 44 290Z M734 99 C867 70 1009 89 1167 148 L1131 287 C1001 256 865 254 747 279Z M794 462 C941 441 1066 479 1174 544 L1145 640 L814 638Z" fill="url(#orchards)" />
          <path d="M0 478 C151 435 254 490 379 461 C526 426 599 438 746 471 C880 501 1024 490 1200 439 L1200 680 L0 680Z" fill="var(--color-map-water)" opacity=".78" />
          <path d="M0 468 C151 425 254 480 379 451 C526 416 599 428 746 461 C880 491 1024 480 1200 429" fill="none" stroke="var(--color-map-river)" strokeWidth="11" opacity=".46" />
          <path d="M0 497 C155 454 262 507 389 480 C526 451 604 458 744 490 C879 519 1035 510 1200 462" fill="none" stroke="var(--color-map-river-soft)" strokeWidth="2" opacity=".8" />

          {ROAD_NETWORK.map((road) => <g key={road.id}><path d={road.d} fill="none" stroke="var(--color-map-road-edge)" strokeWidth={road.major ? 10 : 6} opacity=".8"/><path d={road.d} fill="none" stroke="var(--color-map-road)" strokeWidth={road.major ? 5 : 2.5} opacity={road.major ? ".88" : ".62"}/></g>)}

          {ROUTE_PATHS.map((route) => {
            const visible = showRoute(route.id);
            return <g key={route.id} className={`transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-10"}`}>
              <path d={route.d} fill="none" stroke={route.optimized ? "url(#active-green)" : "url(#active-amber)"} strokeWidth="7" strokeLinecap="round" filter="url(#route-glow-premium)" opacity=".34"/>
              <path d={route.d} fill="none" stroke={route.optimized ? "url(#active-green)" : "url(#active-amber)"} strokeWidth="3.5" strokeLinecap="round" className="route-flow"/>
            </g>;
          })}

          <text x="378" y="321" className="map-road-label">N4 · ZIGUINCHOR — SÉDHIOU</text>
          <text x="815" y="395" className="map-road-label">N6 · KOLDA — VÉLINGARA</text>
          <text x="465" y="518" className="map-water-label">FLEUVE CASAMANCE</text>
          <text x="102" y="118" className="map-zone-label">BASSE CASAMANCE</text>
          <text x="913" y="134" className="map-zone-label">HAUTE CASAMANCE</text>

          {FERMES.map((farm) => {
            const routeVisible = !selectedTruck || farm.tournee === selectedTruck;
            return <g key={farm.id} onClick={() => setActiveFarm(farm)} className={`cursor-pointer transition-opacity duration-300 ${routeVisible ? "opacity-100" : "opacity-25"}`} role="button" aria-label={`Ouvrir la fiche de ${farm.nom}`}>
              <circle cx={sx(farm.x)} cy={sy(farm.y)} r={activeFarm?.id === farm.id ? 15 : 11} fill={farm.optimisee ? "var(--color-route-green-soft)" : "var(--color-route-amber-soft)"} className="producer-ring" />
              <circle cx={sx(farm.x)} cy={sy(farm.y)} r="5" fill={farm.optimisee ? "var(--color-route-green)" : "var(--color-route-amber)"} stroke="var(--color-map)" strokeWidth="3" />
              <text x={sx(farm.x)} y={sy(farm.y) + 24} textAnchor="middle" className="map-label">{farm.zone}</text>
            </g>;
          })}

          <g transform={`translate(${sx(USINE.x)} ${sy(USINE.y)})`} className="factory-marker">
            <circle r="31" fill="none" stroke="var(--color-factory)" strokeWidth="1" opacity=".3" className="factory-pulse" />
            <circle r="20" fill="var(--color-factory-soft)" />
            <path d="M-12 10V-5L-4-11V-5L5-11V-5L13-10V10Z" fill="var(--color-factory)" />
            <path d="M-7 4H-3M1 4H5M9 4H11" stroke="var(--color-map)" strokeWidth="2" />
            <text y="37" textAnchor="middle" className="map-label map-label-strong">PARC SM10 · BAMBALI</text>
          </g>

          {TRUCK_POSITIONS.map((position, index) => {
            const truck = CAMIONS.find((item) => item.id === position.id);
            if (!truck) return null;
            const visible = showRoute(truck.id);
            return <g key={truck.id} transform={`translate(${sx(position.x)} ${sy(position.y)})`} className={`cursor-pointer transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-10"}`} onMouseEnter={() => setHoveredTruck(truck)} onMouseLeave={() => setHoveredTruck(null)} onClick={() => onSelectTruck(selectedTruck === truck.id ? null : truck.id)} role="button" aria-label={`Sélectionner ${truck.id}`}>
              <g transform={`rotate(${position.angle})`} filter="url(#truck-shadow)" className={`truck-drift truck-drift-${index + 1}`}>
                {selectedTruck === truck.id && <rect x="-25" y="-18" width="50" height="36" rx="8" fill="none" stroke="var(--color-foreground)" strokeWidth="1.5" opacity=".75" />}
                <rect x="-20" y="-10" width="25" height="17" rx="3" fill={truck.optimisee ? "var(--color-route-green)" : "var(--color-route-amber)"} />
                <path d="M5-7H14L21-1V7H5Z" fill={truck.optimisee ? "var(--color-route-green-bright)" : "var(--color-route-amber)"}/>
                <path d="M9-5H13L17-1H9Z" fill="var(--color-map)" opacity=".75"/>
                <circle cx="-12" cy="9" r="4" fill="var(--color-map)" stroke="var(--color-foreground)" strokeWidth="1.5"/><circle cx="14" cy="9" r="4" fill="var(--color-map)" stroke="var(--color-foreground)" strokeWidth="1.5"/>
              </g>
            </g>;
          })}
        </g>
      </svg>

      <div className="absolute left-3 top-3 flex flex-col gap-2">
        <div className="map-glass flex gap-1 p-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((value) => Math.min(1.45, value + .12))} title="Zoomer"><Plus className="size-4"/><span className="sr-only">Zoomer</span></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom((value) => Math.max(.9, value - .12))} title="Dézoomer"><Minus className="size-4"/><span className="sr-only">Dézoomer</span></Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setZoom(1)} title="Recentrer"><LocateFixed className="size-4"/><span className="sr-only">Recentrer</span></Button>
        </div>
        <div className="map-glass flex gap-1 p-1">
          {(["terrain", "satellite", "logistique"] as LayerMode[]).map((mode) => <Button key={mode} variant={layer === mode ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setLayer(mode)} title={`Couche ${mode}`}>
            {mode === "terrain" ? <Layers3 className="size-4"/> : mode === "satellite" ? <Satellite className="size-4"/> : <Route className="size-4"/>}<span className="sr-only">Couche {mode}</span>
          </Button>)}
        </div>
      </div>

      <div className="map-glass absolute right-3 top-3 hidden items-center gap-4 px-3 py-2 sm:flex">
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><i className="size-2 rounded-full bg-optimized"/>Optimisée</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><i className="size-2 rounded-full bg-secondary-route"/>Alternative</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><i className="size-2 rounded-full bg-factory"/>Usine</span>
      </div>

      {hoveredTruck && <TruckTooltip truck={hoveredTruck} />}

      {activeFarm && (
        <div className="map-glass absolute bottom-3 left-3 w-[min(340px,calc(100%-24px))] p-4 shadow-dashboard animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div><p className="label-xs">{activeFarm.id} · {activeFarm.zone}</p><p className="mt-1 text-sm font-semibold">{activeFarm.nom}</p></div>
            <Button variant="ghost" size="icon" className="-mr-1 -mt-1 size-7" onClick={() => setActiveFarm(null)} aria-label="Fermer la fiche"><X className="size-4"/></Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/70 pt-3">
            <MapDatum label="Volume" value={`${activeFarm.volume.toFixed(1)} t`} />
            <MapDatum label="Distance" value={`${activeFarm.distance} km`} />
            <MapDatum label="Collecte" value={activeFarm.collecte} />
            <MapDatum label="Tournée" value={activeFarm.tournee} />
          </div>
        </div>
      )}
    </div>
  );
}

function TruckTooltip({ truck }: { truck: Camion }) {
  return <div className="map-glass pointer-events-none absolute right-3 top-16 w-64 p-4 shadow-dashboard animate-fade-in">
    <div className="flex items-center justify-between"><span className="font-mono text-sm font-semibold">{truck.id}</span><span className={`status-pill ${truck.optimisee ? "status-positive" : "status-warning"}`}>{truck.statut}</span></div>
    <p className="mt-1 text-xs text-muted-foreground">{truck.chauffeur} · {truck.itineraire}</p>
    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3">
      <MapDatum label="Charge" value={`${truck.charge}/${truck.capacite} t`} />
      <MapDatum label="Vitesse" value={`${truck.vitesse} km/h`} />
      <MapDatum label="Arrivée" value={truck.arrivee} />
    </div>
  </div>;
}

function MapDatum({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-0.5 truncate font-mono text-xs font-semibold text-foreground">{value}</p></div>;
}