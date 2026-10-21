"""
Contrat de l'API SM10 : formes exactes des réponses.
Les interfaces web génèrent leurs types TypeScript à partir de ce contrat (OpenAPI).
"""

from typing import Literal

from pydantic import BaseModel, Field

PriorityTier = Literal["prioritaire", "standard", "a_surveiller"]
ForecastLevel = Literal["central", "prudent", "stress"]


class PlatformConfig(BaseModel):
    data_status: Literal["simulated"] = Field(
        description="Toutes les données actuelles sont simulées, en attendant les données réelles SM10."
    )
    zones: list[str]
    forecast_seasons: list[int] = Field(description="Saisons prévues hors échantillon par le M3 (plis walk-forward)")
    factory_capacity_t_per_day: float
    factory_capacity_t_per_week: float
    factory_capacity_t_per_year: float
    score_weights: dict[str, float]
    priority_tiers: dict[str, float]


# ─── M2 : Producteurs ────────────────────────────────────────────────────────

class Producer(BaseModel):
    id: str
    area_ha: float = Field(description="A_i — surface du verger")
    yield_t_per_ha: float = Field(description="R_i — rendement")
    reliability: float = Field(description="TR_i — taux de réalisation des engagements (0-1)")
    rejection_rate: float = Field(description="Rej_i — part de la livraison rejetée (0-1)")
    production_t: float = Field(description="P_i — production potentielle")
    deliverable_t: float = Field(description="V_i — volume livrable = TR_i × P_i")
    distance_km: float = Field(description="d_i0 — distance à l'usine")
    score: float = Field(description="Score logistique (0-1)")
    tier: PriorityTier


class ProducerPage(BaseModel):
    total: int
    items: list[Producer]


class TierSummary(BaseModel):
    tier: PriorityTier
    count: int
    mean_score: float
    deliverable_t: float


class ProducerSummary(BaseModel):
    total: int
    deliverable_t: float
    tiers: list[TierSummary]


# ─── M1 : Tournées ───────────────────────────────────────────────────────────

class RouteStop(BaseModel):
    producer: int
    quantity_t: float
    arrival_h: float | None
    loss_t: float


class Tour(BaseModel):
    vehicle: int
    capacity_t: float
    load_t: float
    distance_km: float
    return_h: float | None
    stops: list[RouteStop]


class RoutingPlan(BaseModel):
    status: str
    distance_l3_km: float = Field(description="Distance minimale pure (niveau L3)")
    distance_km: float = Field(description="Distance du plan retenu (niveau L4)")
    collected_t: float
    loss_t: float = Field(description="Pertes post-récolte du plan L4")
    solve_time_s: float
    tours: list[Tour]
    assumptions: dict[str, float]


# ─── M3 : Prévisions ─────────────────────────────────────────────────────────

class ForecastPoint(BaseModel):
    year: int
    zone: str
    week: int
    actual_t: float
    central_t: float
    prudent_t: float
    stress_t: float


class ForecastMetrics(BaseModel):
    weeks: int = Field(description="Nombre de semaines × zones évaluées")
    mae: float
    rmse: float
    bias: float = Field(description="Prévu − observé, en t : positif = surestimation")
    coverage_pct: float = Field(description="Part des semaines où l'observé n'a pas dépassé la prévision")


class ModelBenchmark(BaseModel):
    model: str
    level: ForecastLevel | None = Field(description="Niveau de prévision servi par ce modèle, s'il est retenu")
    all_weeks: ForecastMetrics
    harvest_weeks: ForecastMetrics = Field(description="Semaines de récolte seulement (observé > 0)")


# ─── M4 : Scénarios ──────────────────────────────────────────────────────────

class WeeklyLoad(BaseModel):
    year: int
    week: int
    inflow_t: float
    actual_t: float
    capacity_t: float
    saturation: float
    excess_t: float


class LoadSummary(BaseModel):
    weeks: int
    active_weeks: int
    weeks_over_capacity: int
    mean_active_saturation: float
    peak_saturation: float
    peak_year: int
    peak_week: int
    total_excess_t: float


class CapacityScenario(BaseModel):
    level: ForecastLevel
    volume_factor: float
    capacity_factor: float
    summary: LoadSummary
    weeks: list[WeeklyLoad]
