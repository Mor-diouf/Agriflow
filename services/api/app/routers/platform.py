from fastapi import APIRouter

from common import config
from m3_forecast.outputs import FORECAST_HORIZONS

from app import data
from app.schemas import PlatformConfig

router = APIRouter(tags=["Plateforme"])


@router.get("/config", response_model=PlatformConfig)
def get_config():
    return PlatformConfig(
        data_status="simulated",
        zones=config.ZONES,
        forecast_seasons=sorted(int(y) for y in data.predictions()["fold"].unique()),
        forecast_horizons=FORECAST_HORIZONS,
        factory_capacity_t_per_day=config.FACTORY_CAPACITY_DAILY_T,
        factory_capacity_t_per_week=config.FACTORY_CAPACITY_WEEKLY_T,
        factory_capacity_t_per_year=config.FACTORY_CAPACITY_ANNUAL_T,
        score_weights=config.SCORE_WEIGHTS,
        priority_tiers=config.PRIORITY_TIERS,
    )
