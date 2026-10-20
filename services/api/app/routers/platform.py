from fastapi import APIRouter

from common import config
from app.schemas import PlatformConfig

router = APIRouter(tags=["Plateforme"])


@router.get("/config", response_model=PlatformConfig)
def get_config():
    return PlatformConfig(
        data_status="simulated",
        zones=config.ZONES,
        factory_capacity_t_per_day=config.FACTORY_CAPACITY_DAILY_T,
        factory_capacity_t_per_week=config.FACTORY_CAPACITY_WEEKLY_T,
        factory_capacity_t_per_year=config.FACTORY_CAPACITY_ANNUAL_T,
        score_weights=config.SCORE_WEIGHTS,
        priority_tiers=config.PRIORITY_TIERS,
    )
