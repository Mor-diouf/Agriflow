"""
SM10 Module 3 -- Lecture des résultats produits par l'évaluation à plusieurs semaines
(Phase J, src/horizon_eval.py) : prévisions out-of-sample par zone et par horizon, et
benchmark des modèles par horizon.
"""

import os

import pandas as pd

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

# Semaines d'anticipation évaluées : la semaine t est prévue avec l'information connue en t − h
FORECAST_HORIZONS = list(range(1, 9))

# Niveau de prévision -> colonne du fichier de prédictions
FORECAST_LEVELS = {
    "central": "pred_central",   # Combinaison SARIMAX (dynamique à h pas) + climatologie
    "prudent": "pred_q75",       # Hurdle-Quantile(0.75) direct, recalibré
    "stress": "pred_q90",        # Hurdle-Quantile(0.90) direct, recalibré
}


def load_oos_predictions() -> pd.DataFrame:
    """Prédictions hebdomadaires par zone et horizon (colonnes fold, zone, semaine, horizon, y_true, pred_*)."""
    return pd.read_csv(os.path.join(RESULTS_DIR, "horizon_oos_predictions.csv"), encoding="utf-8")


def load_benchmark() -> pd.DataFrame:
    """
    Métriques (MAE, RMSE, biais, couverture) par horizon, modèle et périmètre : toutes les
    semaines, ou les seules semaines de récolte (observé > 0), qui servent à juger les modèles (D8).
    """
    return pd.read_csv(os.path.join(RESULTS_DIR, "benchmark_horizons_phase_j.csv"), encoding="utf-8")
