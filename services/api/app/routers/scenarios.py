from fastapi import APIRouter, Query

from app import data
from app.schemas import CapacityScenario, ForecastLevel, LoadSummary, WeeklyLoad
from m4_scenarios.capacity import summarize_factory_load, weekly_factory_load

router = APIRouter(prefix="/scenarios", tags=["M4 — Scénarios"])


@router.get("/capacity", response_model=CapacityScenario)
def capacity_scenario(
    level: ForecastLevel = "central",
    volume_factor: float = Query(1.0, gt=0, le=3, description="Multiplicateur du volume récolté"),
    capacity_factor: float = Query(1.0, gt=0, le=3, description="Multiplicateur de la capacité usine"),
    year: int | None = Query(None, description="Restreindre à une saison"),
):
    """Charge hebdomadaire de l'usine : flux prévu par le M3 face à la capacité."""
    weekly = weekly_factory_load(data.predictions(), level, volume_factor, capacity_factor)
    if year is not None:
        weekly = weekly[weekly["year"] == year]
    return CapacityScenario(
        level=level,
        volume_factor=volume_factor,
        capacity_factor=capacity_factor,
        summary=LoadSummary(**summarize_factory_load(weekly)),
        weeks=[WeeklyLoad(**r) for r in weekly.to_dict(orient="records")],
    )
