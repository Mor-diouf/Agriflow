"""
Contrat de l'API SM10 : formes exactes des réponses.
Les interfaces web génèrent leurs types TypeScript à partir de ce contrat (OpenAPI).
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from common.config import ZONES

PriorityTier = Literal["prioritaire", "standard", "a_surveiller"]
ForecastLevel = Literal["central", "prudent", "stress"]


class PlatformConfig(BaseModel):
    data_status: Literal["simulated"] = Field(
        description="Toutes les données actuelles sont simulées, en attendant les données réelles SM10."
    )
    zones: list[str]
    forecast_seasons: list[int] = Field(description="Saisons prévues hors échantillon par le M3 (plis walk-forward)")
    forecast_horizons: list[int] = Field(description="Semaines d'anticipation disponibles pour les prévisions du M3")
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
    horizon: int = Field(description="Semaines d'anticipation de la prévision évaluée")
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
    horizon: int = Field(description="Semaines d'anticipation des prévisions utilisées")
    volume_factor: float
    capacity_factor: float
    summary: LoadSummary
    weeks: list[WeeklyLoad]


# ─── Collecte terrain ────────────────────────────────────────────────────────

ZoneName = Literal[tuple(ZONES)]


class FieldProducerIn(BaseModel):
    """Fiche d'un producteur recensé par un agent de terrain."""
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(None, pattern=r"^\+?[0-9 ]{7,20}$")
    village: str = Field(min_length=2, max_length=80)
    zone: ZoneName
    area_ha: float | None = Field(None, ge=0, le=1000, description="Surface du verger")
    trees: int | None = Field(None, ge=0, le=100_000, description="Nombre de manguiers")
    main_variety: str | None = Field(None, max_length=40, description="Variété principale (Kent, Keitt…)")
    # Bornes de la Casamance : une latitude et une longitude inversées sont refusées
    latitude: float | None = Field(None, ge=12.0, le=13.5)
    longitude: float | None = Field(None, ge=-17.0, le=-13.5)
    consent_given: Literal[True] = Field(
        description="Le producteur accepte que ses données soient enregistrées (loi n° 2008-12) : obligatoire",
    )


class FieldProducerOut(FieldProducerIn):
    id: str
    code: str = Field(description="Code lisible attribué par le serveur (AGR-0001)")
    created_at: datetime
    updated_at: datetime
    harvest_count: int
    harvested_kg: float
    rejection_rate: float | None = Field(description="Part rejetée sur l'ensemble des relevés (0-1)")


class HarvestRecordIn(BaseModel):
    """Relevé d'une collecte chez un producteur."""
    producer_id: str
    harvest_date: date
    quantity_kg: float = Field(gt=0, le=50_000)
    rejected_kg: float = Field(0.0, ge=0)
    expected_next_week_kg: float | None = Field(
        None, ge=0, le=50_000, description="Récolte attendue par le producteur la semaine suivante",
    )
    notes: str | None = Field(None, max_length=500)

    @field_validator("harvest_date")
    @classmethod
    def not_in_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("la date de collecte ne peut pas être dans le futur")
        return value

    @model_validator(mode="after")
    def rejected_within_quantity(self):
        if self.rejected_kg > self.quantity_kg:
            raise ValueError("la quantité rejetée dépasse la quantité collectée")
        return self


class HarvestRecordOut(HarvestRecordIn):
    id: str
    producer_code: str
    season: int
    week: int = Field(description="Semaine ISO de la collecte")
    recorded_at: datetime
    updated_at: datetime


class ZoneFieldSummary(BaseModel):
    zone: str
    producers: int
    records: int
    harvested_t: float
    rejected_t: float
    rejection_rate: float | None


class FieldWeek(BaseModel):
    season: int
    week: int
    zone: str
    harvested_t: float


class FieldSummary(BaseModel):
    producers: int
    records: int
    zones: list[ZoneFieldSummary]
    weeks: list[FieldWeek]
