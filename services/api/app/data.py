"""
Accès aux résultats de core/, mis en cache : les calculs sont déterministes
(seed fixe), ils ne sont donc faits qu'une fois par démarrage du serveur.
"""

from functools import lru_cache

import pandas as pd

from m1_routing.reference import solve_reference_instance
from m2_producers.catalog import build_producer_table
from m3_forecast.outputs import load_benchmark, load_oos_predictions


@lru_cache(maxsize=1)
def producers() -> pd.DataFrame:
    return build_producer_table()


@lru_cache(maxsize=1)
def routing_plan() -> dict:
    return solve_reference_instance()


@lru_cache(maxsize=1)
def all_predictions() -> pd.DataFrame:
    return load_oos_predictions()


def predictions(horizon: int = 1) -> pd.DataFrame:
    """Prévisions faites `horizon` semaines à l'avance ; les colonnes pred_* suivent FORECAST_LEVELS."""
    df = all_predictions()
    return df[df["horizon"] == horizon]


@lru_cache(maxsize=1)
def benchmark() -> pd.DataFrame:
    return load_benchmark()
