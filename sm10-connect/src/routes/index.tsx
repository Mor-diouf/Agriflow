import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Compass,
  Factory,
  Gauge,
  Layers,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  Zap,
  RefreshCw,
  Info,
  Calendar,
  Filter,
  Route as RouteIcon,
  CloudSun,
  Sliders,
  FileText,
  Printer,
  MapPin,
  Clock,
  Fuel,
  Leaf,
  ShieldCheck,
} from "lucide-react";
import { EnterpriseShell, Metric, Section } from "@/components/EnterpriseShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CarteTournees } from "@/components/CarteTournees";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";

import scenariosRaw from "@/lib/data/module4_scenarios_real.json";
import forecastRaw from "@/lib/data/module3_forecast_real.json";
import vrpRaw from "@/lib/data/module1_vrp_real.json";
import producersRaw from "@/lib/data/module2_producers_real.json";
import { CAMIONS, type Camion } from "@/lib/module1-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cockpit Décisionnel Unifié | SM10 Agro Casamance" },
      {
        name: "description",
        content:
          "Tableau de bord unifié d'orchestration logistique, scoring producteurs et prévision de récolte (Modules 1, 2, 3, 4).",
      },
    ],
  }),
  component: UnifiedCockpit,
});

type ScenarioId =
  | "scenario_nominal"
  | "scenario_peak"
  | "scenario_truck_failure"
  | "scenario_factory_downtime";

function UnifiedCockpit() {
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<ScenarioId>("scenario_nominal");
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"cockpit" | "tournees" | "producteurs">(
    "cockpit"
  );

  // Mode curseurs manuels (Simulateur Continu)
  const [customMode, setCustomMode] = useState(false);
  const [volumeDeltaPct, setVolumeDeltaPct] = useState(0); // -50% to +100%
  const [factoryDailyCap, setFactoryDailyCap] = useState(35); // 15 to 50 t/j
  const [activeTrucksCount, setActiveTrucksCount] = useState(2); // 1 to 4 camions

  // Sélection camion pour la carte
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);

  // Sélection producteur pour la vue détaillée
  const [selectedProducerId, setSelectedProducerId] = useState<string>("P001");

  // Scénario actif prédéfini
  const presetScenario = useMemo(() => {
    return (
      scenariosRaw.scenarios.find((s) => s.id === selectedScenarioId) ??
      scenariosRaw.scenarios[0]!
    );
  }, [selectedScenarioId]);

  // Données dynamiques (soit prédéfinies soit calculées par les curseurs)
  const dynamicMetrics = useMemo(() => {
    if (!customMode) {
      return {
        weeklyInflow: presetScenario.weekly_inflow_t,
        factoryCapacity: presetScenario.factory_capacity_t,
        saturationPct: presetScenario.factory_saturation_pct,
        activeTrucks: presetScenario.trucks_active,
        reserveTrucks: presetScenario.trucks_reserve,
        lossPostHarvest: presetScenario.loss_post_harvest_t,
        uncollectedVolume: presetScenario.uncollected_volume_t,
        fuelCostCFA:
          presetScenario.trucks_active === 1
            ? 45000
            : presetScenario.trucks_active === 3
            ? 128000
            : vrpRaw.kpis.fuel_cost_cfa,
        co2Kg:
          presetScenario.trucks_active === 1
            ? 135.0
            : presetScenario.trucks_active === 3
            ? 360.5
            : vrpRaw.kpis.co2_emissions_kg,
      };
    }

    // Calculs en mode continu
    const baseWeekly = 128.4;
    const weeklyInflow = +(baseWeekly * (1 + volumeDeltaPct / 100)).toFixed(1);
    const weeklyFactoryCap = +(factoryDailyCap * 4.67).toFixed(1); // 4.67 j équivalent plein régime
    const saturationPct = Math.round((weeklyInflow / weeklyFactoryCap) * 100);

    // Flotte : chaque camion effectue ~10 t par rotation, 2 rotations semaine
    const fleetCapacity = activeTrucksCount * 18.0;
    const uncollectedVolume = Math.max(0, +(weeklyInflow - fleetCapacity).toFixed(1));

    // Pertes post-récolte : 2.5% de base, augmente si usine saturée ou camions insuffisants
    const overloadFactor = Math.max(1, saturationPct / 100);
    const lossPostHarvest = +(0.35 * overloadFactor + uncollectedVolume * 0.12).toFixed(2);

    const fuelCostCFA = Math.round(activeTrucksCount * 42925 * (1 + Math.abs(volumeDeltaPct) / 200));
    const co2Kg = +(activeTrucksCount * 121.2 * (1 + Math.abs(volumeDeltaPct) / 200)).toFixed(1);

    return {
      weeklyInflow,
      factoryCapacity: weeklyFactoryCap,
      saturationPct,
      activeTrucks: activeTrucksCount,
      reserveTrucks: activeTrucksCount < 3 ? 1 : 0,
      lossPostHarvest,
      uncollectedVolume,
      fuelCostCFA,
      co2Kg,
    };
  }, [
    customMode,
    presetScenario,
    volumeDeltaPct,
    factoryDailyCap,
    activeTrucksCount,
  ]);

  // Données de prévision pour Recharts
  const chartData = useMemo(() => {
    const raw =
      selectedZone === "all"
        ? forecastRaw.global_trajectory
        : ((forecastRaw as any).zone_trajectories?.[selectedZone] ??
          forecastRaw.global_trajectory);

    const capLimit = dynamicMetrics.factoryCapacity;

    return (raw as any[])
      .filter((pt: any) => pt.week >= 16 && pt.week <= 36)
      .map((pt: any) => ({
        week: pt.weekLabel,
        weekNum: pt.week,
        central: pt.forecast_central,
        prudent: pt.forecast_prudent,
        stress: pt.forecast_stress,
        actual: pt.y_true > 0 ? pt.y_true : null,
        factoryCap: capLimit,
      }));
  }, [selectedZone, dynamicMetrics.factoryCapacity]);

  // Producteur sélectionné
  const selectedProducer = useMemo(() => {
    return (
      producersRaw.producers.find((p) => p.id === selectedProducerId) ??
      producersRaw.producers[0]!
    );
  }, [selectedProducerId]);

  return (
    <EnterpriseShell
      active="overview"
      code="MODULE 4 — COCKPIT DÉCISIONNEL UNIFIÉ"
      title="Tableau de Bord Unifié — SM10 Agro"
      subtitle="Plateforme d'aide à la décision : orchestration logistique, scoring producteurs et prévisions de récolte en Casamance"
      status="SYSTÈME PYTHON CONNECTÉ"
      actions={
        <div className="flex items-center gap-2">
          {/* Modal Fiche Décisionnelle */}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="default" className="text-xs gap-1.5 bg-primary text-primary-foreground">
                <FileText className="size-3.5" />
                Fiche de Décision
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between border-b pb-3">
                  <div>
                    <DialogTitle className="text-lg font-bold">
                      Fiche d'Arbitrage Décisionnel — SM10 Agro
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                      Générée d'après les modèles validés (SARIMAX, PuLP VRP, K-Means)
                    </DialogDescription>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary">
                    VALIDE 2026
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-4 text-xs pt-2">
                {/* Résumé de situation */}
                <div className="rounded-lg border bg-surface/50 p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-mono font-semibold text-foreground">
                      SCÉNARIO SIMULÉ : {customMode ? "Simulation Continue Personnalisée" : presetScenario.title}
                    </span>
                    <Badge
                      className={
                        dynamicMetrics.saturationPct > 100
                          ? "bg-rose-500/20 text-rose-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }
                    >
                      Saturation : {dynamicMetrics.saturationPct}%
                    </Badge>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    {customMode
                      ? `Flux récolte estimé à ${dynamicMetrics.weeklyInflow} t/semaine avec ${dynamicMetrics.activeTrucks} camion(s) mobilisé(s) et une capacité usine de ${dynamicMetrics.factoryCapacity} t/semaine.`
                      : presetScenario.description}
                  </p>
                </div>

                {/* Plan de contingence logistique */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 bg-surface/30">
                    <p className="font-mono text-[10px] uppercase text-muted-foreground font-semibold">
                      DIRECTIVE USINE (BAMBALI)
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {dynamicMetrics.saturationPct > 100
                        ? "Passage en poste 2×8 et délestage vers les chambres froides tampons de Ziguinchor."
                        : "Cadence nominale maintenue, quai de déchargement fluide."}
                    </p>
                    <p className="mt-2 text-[10px] font-mono text-muted-foreground">
                      Capacité : {dynamicMetrics.factoryCapacity} t/sem | Flux : {dynamicMetrics.weeklyInflow} t
                    </p>
                  </div>

                  <div className="rounded-lg border p-3 bg-surface/30">
                    <p className="font-mono text-[10px] uppercase text-muted-foreground font-semibold">
                      DIRECTIVE FLOTTE (PULP VRP)
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {dynamicMetrics.activeTrucks < 2
                        ? "Plan d'urgence : Desserte exclusive des 62 producteurs de Profil A."
                        : `${dynamicMetrics.activeTrucks} camions en rotation active (202 km planifiés).`}
                    </p>
                    <p className="mt-2 text-[10px] font-mono text-muted-foreground">
                      Pertes évitées : +2,17 t | CO2 : {dynamicMetrics.co2Kg} kg
                    </p>
                  </div>
                </div>

                {/* Table des priorités producteurs */}
                <div>
                  <p className="font-mono text-[11px] font-semibold text-foreground mb-1.5">
                    Producteurs Stratégiques Prioritaires en Collecte Immédiate :
                  </p>
                  <div className="rounded border divide-y overflow-hidden font-mono text-[11px]">
                    <div className="bg-muted/40 p-2 font-semibold grid grid-cols-4">
                      <span>Producteur</span>
                      <span>Zone</span>
                      <span>Production</span>
                      <span>Score Logistique</span>
                    </div>
                    {producersRaw.producers.slice(0, 4).map((p) => (
                      <div key={p.id} className="p-2 grid grid-cols-4 bg-background">
                        <span>{p.name}</span>
                        <span>{p.zone}</span>
                        <span>{p.production_total_t} t</span>
                        <span className="text-emerald-400 font-semibold">{p.score_logistique}/100</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3 text-[10px] text-muted-foreground">
                  <span>Signataire : Direction des Opérations Agricoles SM10</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1"
                    onClick={() => window.print()}
                  >
                    <Printer className="size-3.5" />
                    Imprimer / PDF
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Link to="/reports">
            <Button size="sm" variant="outline" className="text-xs">
              Rapports
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* =========================================================================
            HEADER TABS : NAVIGATION RAPIDE ENTRE LES FACETTES DU MODULE 4
            ========================================================================= */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as any)}
            className="w-full sm:w-auto"
          >
            <TabsList className="grid grid-cols-3 w-full sm:w-auto">
              <TabsTrigger value="cockpit" className="text-xs gap-1.5">
                <Gauge className="size-3.5" />
                <span>Cockpit & Scénarios</span>
              </TabsTrigger>
              <TabsTrigger value="tournees" className="text-xs gap-1.5">
                <RouteIcon className="size-3.5" />
                <span>Tournées & Flotte (M1)</span>
              </TabsTrigger>
              <TabsTrigger value="producteurs" className="text-xs gap-1.5">
                <Users className="size-3.5" />
                <span>Producteurs K-Means (M2)</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={customMode ? "secondary" : "outline"}
              className="text-xs gap-1.5 h-8 font-mono"
              onClick={() => setCustomMode(!customMode)}
            >
              <Sliders className="size-3.5" />
              <span>{customMode ? "Mode Scénarios Fixes" : "Mode Curseurs Continus"}</span>
            </Button>
          </div>
        </div>

        {/* =========================================================================
            CONTENU DE L'ONGLET 1 : COCKPIT DÉCISIONNEL & SIMULATEUR WHAT-IF
            ========================================================================= */}
        {activeTab === "cockpit" && (
          <div className="space-y-6 animate-fade-in">
            {/* PANNEAU DE SIMULATION (Fixe ou Continu) */}
            <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-card/90 via-card/70 to-card/90 p-5 shadow-lg backdrop-blur-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary">
                      <Zap className="size-3.5" />
                    </span>
                    <h2 className="text-base font-semibold tracking-tight">
                      Simulateur de Scénarios Opérationnels (Module 4)
                    </h2>
                    <Badge className="bg-primary/20 text-primary font-mono text-[10px]">
                      {customMode ? "SIMULATION CONTINUE" : "4 SCÉNARIOS PRÉCALCULÉS"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {customMode
                      ? "Ajustez librement les curseurs pour observer les impacts croisés sur l'usine, la flotte et les producteurs."
                      : "Basculez entre les scénarios d'exploitation pour évaluer instantanément la résilience de la chaîne logistique."}
                  </p>
                </div>

                {!customMode ? (
                  <Badge
                    variant="secondary"
                    className={`font-mono text-[11px] ${
                      presetScenario.badgeColor === "green"
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : presetScenario.badgeColor === "red"
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        : presetScenario.badgeColor === "orange"
                        ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}
                  >
                    {presetScenario.badge}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground h-7"
                    onClick={() => {
                      setVolumeDeltaPct(0);
                      setFactoryDailyCap(35);
                      setActiveTrucksCount(2);
                    }}
                  >
                    <RefreshCw className="size-3 mr-1" />
                    Réinitialiser
                  </Button>
                )}
              </div>

              {/* SOUS-PANNEAU SCÉNARIOS PRÉDÉFINIS */}
              {!customMode ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 mt-4">
                  {scenariosRaw.scenarios.map((sc) => {
                    const isSelected = sc.id === selectedScenarioId;
                    return (
                      <button
                        key={sc.id}
                        onClick={() => setSelectedScenarioId(sc.id as ScenarioId)}
                        className={`group relative flex flex-col justify-between rounded-lg border p-3.5 text-left transition-all duration-200 ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                            : "border-border/60 bg-surface/40 hover:border-border hover:bg-surface/80"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-semibold text-xs tracking-tight text-foreground">
                            {sc.title}
                          </span>
                          {isSelected ? (
                            <span className="size-2 rounded-full bg-primary" />
                          ) : (
                            <span className="size-2 rounded-full bg-muted-foreground/30" />
                          )}
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {sc.description}
                        </p>
                        <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-muted-foreground/80 border-t border-border/40 pt-2">
                          <span>Flux: {sc.weekly_inflow_t} t/sem</span>
                          <span
                            className={
                              sc.factory_saturation_pct > 100
                                ? "text-rose-400 font-semibold"
                                : "text-emerald-400"
                            }
                          >
                            {sc.factory_saturation_pct}% Usine
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* SOUS-PANNEAU CURSEURS CONTINUS */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 p-4 rounded-lg bg-surface/30 border border-border/60">
                  {/* Slider 1: Volume */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center font-mono text-xs">
                      <span className="text-muted-foreground">Volume de Récolte :</span>
                      <span className="font-semibold text-primary">
                        {volumeDeltaPct > 0 ? `+${volumeDeltaPct}%` : `${volumeDeltaPct}%`} ({dynamicMetrics.weeklyInflow} t)
                      </span>
                    </div>
                    <Slider
                      value={[volumeDeltaPct]}
                      min={-50}
                      max={100}
                      step={5}
                      onValueChange={(val) => setVolumeDeltaPct(val[0] ?? 0)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>-50% (Creux)</span>
                      <span>Nominal</span>
                      <span>+100% (Pic)</span>
                    </div>
                  </div>

                  {/* Slider 2: Capacité Usine */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center font-mono text-xs">
                      <span className="text-muted-foreground">Capacité Usine (Jour) :</span>
                      <span className="font-semibold text-primary">
                        {factoryDailyCap} t/j ({dynamicMetrics.factoryCapacity} t/sem)
                      </span>
                    </div>
                    <Slider
                      value={[factoryDailyCap]}
                      min={15}
                      max={50}
                      step={1}
                      onValueChange={(val) => setFactoryDailyCap(val[0] ?? 35)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>15 t/j (Panne)</span>
                      <span>35 t/j (Nominal)</span>
                      <span>50 t/j (Max 2×8)</span>
                    </div>
                  </div>

                  {/* Slider 3: Flotte */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center font-mono text-xs">
                      <span className="text-muted-foreground">Camions Actifs :</span>
                      <span className="font-semibold text-primary">
                        {activeTrucksCount} Véhicule{activeTrucksCount > 1 ? "s" : ""}
                      </span>
                    </div>
                    <Slider
                      value={[activeTrucksCount]}
                      min={1}
                      max={4}
                      step={1}
                      onValueChange={(val) => setActiveTrucksCount(val[0] ?? 2)}
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                      <span>1 (Panne)</span>
                      <span>2 (Nominal)</span>
                      <span>4 (Affrètement)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Directive tactique & résumé opérationnel */}
              <div className="mt-4 rounded-lg border border-border/80 bg-background/60 p-3.5 backdrop-blur-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 rounded p-1 bg-primary/15 text-primary">
                      <ShieldAlert className="size-4" />
                    </div>
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-primary font-semibold">
                        Directive d'Exploitation Immédiate
                      </p>
                      <p className="text-xs text-foreground mt-0.5 leading-relaxed font-medium">
                        {customMode
                          ? dynamicMetrics.saturationPct > 100
                            ? `Alerte Saturation (${dynamicMetrics.saturationPct}%) : extension de poste requise à Bambali et priorité absolue aux 62 vergers Profil A.`
                            : `Régime sous contrôle (${dynamicMetrics.saturationPct}%) : collecte fluide et déroulement régulier des tournées PuLP.`
                          : presetScenario.operational_action}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono shrink-0 pl-7 md:pl-0">
                    <div>
                      <span className="text-muted-foreground text-[10px]">
                        Flotte Active :
                      </span>{" "}
                      <span className="font-semibold text-foreground">
                        {dynamicMetrics.activeTrucks} Camion
                        {dynamicMetrics.activeTrucks > 1 ? "s" : ""}
                      </span>
                      {dynamicMetrics.reserveTrucks > 0 && (
                        <span className="text-primary text-[10px] ml-1">
                          (+{dynamicMetrics.reserveTrucks} rés.)
                        </span>
                      )}
                    </div>
                    <div className="border-l border-border pl-4">
                      <span className="text-muted-foreground text-[10px]">
                        Pertes Post-Récolte :
                      </span>{" "}
                      <span
                        className={`font-semibold ${
                          dynamicMetrics.lossPostHarvest > 1.0
                            ? "text-rose-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {dynamicMetrics.lossPostHarvest} t
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dynamic alerts */}
                {!customMode && presetScenario.alerts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-2.5">
                    {presetScenario.alerts.map((al, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-1.5 rounded bg-rose-500/10 border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300"
                      >
                        <AlertTriangle className="size-3 shrink-0" />
                        <span>{al.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SYNOPTIC METRICS (4 CARDS) */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <article className="ops-metric border border-border/80">
                <div className="flex items-start justify-between gap-2">
                  <p>M3 · FLUX ESTIMÉ HEBDO</p>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                    {selectedScenarioId === "scenario_peak" ? "STRESS Q0.90" : "SARIMAX(1)"}
                  </span>
                </div>
                <div className="mt-3 font-mono">
                  <b>{dynamicMetrics.weeklyInflow}</b>
                  <span>t/sem</span>
                </div>
                <small>
                  {dynamicMetrics.uncollectedVolume > 0
                    ? `Dépassement flotte : ${dynamicMetrics.uncollectedVolume} t en attente`
                    : "Collecte intégrale assurée"}
                </small>
              </article>

              <article className="ops-metric border border-border/80">
                <div className="flex items-start justify-between gap-2">
                  <p>USINE BAMBALI · SATURATION</p>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${
                      dynamicMetrics.saturationPct > 100
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {dynamicMetrics.saturationPct}%
                  </span>
                </div>
                <div className="mt-3 font-mono">
                  <b>{dynamicMetrics.factoryCapacity}</b>
                  <span>t max</span>
                </div>
                <div className="mt-1">
                  <Progress
                    value={Math.min(100, dynamicMetrics.saturationPct)}
                    className="h-1.5"
                  />
                </div>
                <small>
                  {dynamicMetrics.saturationPct > 100
                    ? "Surcharge usine : activation froid tampon"
                    : "Marge opérationnelle disponible"}
                </small>
              </article>

              <article className="ops-metric border border-border/80">
                <div className="flex items-start justify-between gap-2">
                  <p>M1 · TOURNÉES & CARBURANT</p>
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] text-emerald-400">
                    PULP OPTIM
                  </span>
                </div>
                <div className="mt-3 font-mono">
                  <b>{dynamicMetrics.fuelCostCFA.toLocaleString("fr-FR")}</b>
                  <span>FCFA</span>
                </div>
                <small>
                  {vrpRaw.kpis.distance_saved_km} km sauvés (−{vrpRaw.kpis.distance_saved_pct}%) · {dynamicMetrics.co2Kg} kg CO2
                </small>
              </article>

              <article className="ops-metric border border-border/80">
                <div className="flex items-start justify-between gap-2">
                  <p>M2 · PRODUCTEURS PRIORITAIRES</p>
                  <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                    K-MEANS
                  </span>
                </div>
                <div className="mt-3 font-mono">
                  <b>{producersRaw.cluster_stats.strategic.count}</b>
                  <span>/ 100</span>
                </div>
                <small>
                  Profils A (Stratégiques) prioritaires en collecte
                </small>
              </article>
            </div>

            {/* GRAPHIQUE PRÉVISION MULTI-NIVEAUX & STRESS */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CloudSun className="size-4 text-primary" />
                    <h3 className="font-semibold text-sm tracking-tight">
                      M3 · Trajectoire Prédictive Tri-Niveaux & Capacité Usine
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Modèle officiel : Prévision Centrale SARIMAX (MAE = 2,77 t), Prudentielle Q0.75 et Plafond de Stress Q0.90.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Zone :
                  </span>
                  <select
                    value={selectedZone}
                    onChange={(e) => setSelectedZone(e.target.value)}
                    className="rounded-md border border-input bg-surface px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="all">Toute la Casamance</option>
                    {forecastRaw.zones.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="prudentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="centralGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis
                      dataKey="week"
                      stroke="#71717a"
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis stroke="#71717a" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#18181b",
                        border: "1px solid #3f3f46",
                        borderRadius: "6px",
                        fontSize: "11px",
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    />
                    <ReferenceLine
                      y={dynamicMetrics.factoryCapacity}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{
                        value: `Seuil Usine (${dynamicMetrics.factoryCapacity} t)`,
                        fill: "#ef4444",
                        fontSize: 10,
                        position: "insideTopRight",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="stress"
                      name="Stress Q0.90"
                      stroke="#ef4444"
                      fillOpacity={1}
                      fill="url(#stressGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="prudent"
                      name="Prudent Q0.75"
                      stroke="#f59e0b"
                      fillOpacity={1}
                      fill="url(#prudentGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="central"
                      name="Centrale SARIMAX(1)"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#centralGrad)"
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Réalisé Historique"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                <span>Fenêtre critique de maturité : Semaines S20 à S32 (Période des pics majeurs)</span>
                <Link
                  to="/module3"
                  className="flex items-center gap-1 text-primary hover:underline font-medium"
                >
                  Accéder à l'analyse fine des résidus M3
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            CONTENU DE L'ONGLET 2 : TOURNÉES & FLOTTE (MODULE 1 CONNECTÉ)
            ========================================================================= */}
        {activeTab === "tournees" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Carte Interactive des Tournées PuLP */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                      <MapPin className="size-4 text-primary" />
                      Carte Opérationnelle de Collecte · Casamance
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Visualisation des tournées optimisées PuLP vers l'usine centrale de Bambali.
                    </p>
                  </div>
                  <Badge variant="outline" className="font-mono text-[9px]">
                    SOLVEUR PULP ACTIF
                  </Badge>
                </div>

                <div className="overflow-hidden rounded-lg border border-border/60">
                  <CarteTournees
                    filter="Toutes"
                    selectedTruck={selectedTruck}
                    onSelectTruck={setSelectedTruck}
                  />
                </div>
              </div>

              {/* Panneau Flotte et Rotations */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                      <Truck className="size-4 text-primary" />
                      État de la Flotte PuLP
                    </h3>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {CAMIONS.length} VÉHICULES
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {CAMIONS.map((truck) => (
                      <div
                        key={truck.id}
                        onClick={() => setSelectedTruck(selectedTruck === truck.id ? null : truck.id)}
                        className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                          selectedTruck === truck.id
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border/60 bg-surface/50 hover:border-border hover:bg-surface/80"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-semibold text-xs text-foreground">
                            {truck.id}
                          </span>
                          <Badge
                            className={`text-[9px] ${
                              truck.statut === "En route"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {truck.statut}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-foreground font-medium mt-1">
                          {truck.chauffeur} · {truck.typeCamion ?? "Standard"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {truck.itineraire}
                        </p>
                        <div className="mt-2 flex justify-between text-[10px] font-mono text-muted-foreground">
                          <span>Charge : {truck.charge} / {truck.capacite} t</span>
                          <span>{Math.round((truck.charge / truck.capacite) * 100)}%</span>
                        </div>
                        <Progress
                          value={(truck.charge / truck.capacite) * 100}
                          className="h-1 mt-1"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 border-t border-border/40 pt-3">
                  <Link
                    to="/module1"
                    className="flex items-center justify-between text-xs text-primary font-medium hover:underline"
                  >
                    <span>Ouvrir le Module 1 complet (table de flotte)</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            CONTENU DE L'ONGLET 3 : PRODUCTEURS & K-MEANS (MODULE 2 CONNECTÉ)
            ========================================================================= */}
        {activeTab === "producteurs" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Liste des 100 producteurs avec filtres */}
              <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3 mb-4">
                  <div>
                    <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                      <Users className="size-4 text-primary" />
                      Portefeuille Producteurs Scoré (K-Means k=4)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      100 producteurs qualifiés par scoring multicritère logistique et agronomique.
                    </p>
                  </div>
                  <Link to="/module2">
                    <Button size="sm" variant="outline" className="text-xs">
                      Module 2 Complet
                    </Button>
                  </Link>
                </div>

                <div className="max-h-[460px] overflow-y-auto divide-y border rounded-lg">
                  {producersRaw.producers.map((prod) => (
                    <div
                      key={prod.id}
                      onClick={() => setSelectedProducerId(prod.id)}
                      className={`p-3 cursor-pointer flex items-center justify-between transition-colors ${
                        selectedProducerId === prod.id
                          ? "bg-primary/10 border-l-4 border-l-primary"
                          : "hover:bg-surface/50"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {prod.name}
                          </span>
                          <Badge
                            className={`text-[9px] font-mono ${
                              prod.cluster === "strategic"
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {prod.clusterLabel}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Zone {prod.zone} · {prod.distance_factory_km} km de l'usine · Fenêtre {prod.harvest_window}
                        </p>
                      </div>

                      <div className="text-right font-mono text-xs">
                        <span className="text-foreground font-semibold">
                          {prod.production_total_t} t
                        </span>
                        <p className="text-[10px] text-emerald-400">
                          Score : {prod.score_logistique}/100
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fiche d'audit du producteur sélectionné */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="border-b border-border/60 pb-3">
                  <Badge variant="outline" className="font-mono text-[9px] text-primary">
                    FICHE PRODUCTEUR DÉTAILLÉE
                  </Badge>
                  <h3 className="font-bold text-base text-foreground mt-1">
                    {selectedProducer.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Identifiant : {selectedProducer.id} · Région Casamance
                  </p>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Segment K-Means :</span>
                    <span className="font-semibold text-primary">{selectedProducer.clusterLabel}</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Surface verger :</span>
                    <span className="text-foreground">{selectedProducer.area_ha} ha</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Rendement :</span>
                    <span className="text-foreground">{selectedProducer.yield_t_ha} t/ha</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Production totale :</span>
                    <span className="font-bold text-foreground">{selectedProducer.production_total_t} t</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Régularité livraison :</span>
                    <span className="text-emerald-400 font-semibold">{selectedProducer.regularity_pct}%</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Taux de rejet qualité :</span>
                    <span className="text-amber-400 font-semibold">{selectedProducer.rejection_pct}%</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Distance usine Bambali :</span>
                    <span className="text-foreground">{selectedProducer.distance_factory_km} km</span>
                  </div>
                  <div className="flex justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Score Logistique :</span>
                    <span className="text-emerald-400 font-bold">{selectedProducer.score_logistique} / 100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Score de Risque :</span>
                    <span className="text-rose-400 font-bold">{selectedProducer.score_risque} / 100</span>
                  </div>
                </div>

                <div className="rounded-lg bg-surface/50 border p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">Stratégie d'engagement :</p>
                  {selectedProducer.cluster === "strategic"
                    ? "Producteur pivot à fidéliser par contractualisation pluriannuelle et ramassage prioritaire en camion frigorifique."
                    : "Producteur régulier nécessitant un accompagnement agronomique pour réduire le taux de rejet qualité sous 10%."}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            FOOTER COMMUN CERTIFIÉ REPRODUCTIBLE
            ========================================================================= */}
        <div className="rounded-xl border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-primary shrink-0" />
            <span>
              Plateforme SM10 Agro synchronisée avec les modèles Python certifiés : 
              <code> pulp_vrp.py</code>, <code> kmeans_scoring.py</code>, <code> hurdle_sarimax.py</code> et <code> quantile_loss.py</code>.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-[10px]">
              CASAMANCE AGRI-LOGISTICS · SM10 V4.0
            </span>
          </div>
        </div>
      </div>
    </EnterpriseShell>
  );
}
