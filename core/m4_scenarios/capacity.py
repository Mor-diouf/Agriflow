"""
SM10 Module 4 -- Scénarios de charge usine.

Confronte le flux hebdomadaire prévu par le M3 (somme des zones) à la capacité
de l'usine, avec deux leviers what-if : variation du volume récolté et
variation de la capacité usine.
"""

from typing import Dict

import pandas as pd

from common.config import FACTORY_CAPACITY_WEEKLY_T
from m3_forecast.outputs import FORECAST_LEVELS


def weekly_factory_load(
    predictions: pd.DataFrame,
    level: str = "central",
    volume_factor: float = 1.0,
    capacity_factor: float = 1.0,
) -> pd.DataFrame:
    """
    Une ligne par (année, semaine) : flux prévu, flux observé, capacité,
    taux de saturation et excédent non traitable.
    """
    if level not in FORECAST_LEVELS:
        raise ValueError(f"Niveau inconnu : {level} (attendu : {list(FORECAST_LEVELS)})")

    weekly = (
        predictions.groupby(["fold", "semaine"], as_index=False)
        .agg(inflow_t=(FORECAST_LEVELS[level], "sum"), actual_t=("y_true", "sum"))
        .rename(columns={"fold": "year", "semaine": "week"})
    )
    capacity = FACTORY_CAPACITY_WEEKLY_T * capacity_factor
    weekly["inflow_t"] = weekly["inflow_t"] * volume_factor
    weekly["capacity_t"] = capacity
    weekly["saturation"] = weekly["inflow_t"] / capacity
    weekly["excess_t"] = (weekly["inflow_t"] - capacity).clip(lower=0.0)
    return weekly


def summarize_factory_load(weekly: pd.DataFrame) -> Dict:
    """Indicateurs clés d'un scénario : semaines en surcharge, pic, excédent total."""
    active = weekly[weekly["inflow_t"] > 0]
    peak = weekly.loc[weekly["saturation"].idxmax()]
    return {
        "weeks": int(len(weekly)),
        "active_weeks": int(len(active)),
        "weeks_over_capacity": int((weekly["saturation"] > 1.0).sum()),
        "mean_active_saturation": float(active["saturation"].mean()) if len(active) else 0.0,
        "peak_saturation": float(peak["saturation"]),
        "peak_year": int(peak["year"]),
        "peak_week": int(peak["week"]),
        "total_excess_t": float(weekly["excess_t"].sum()),
    }
