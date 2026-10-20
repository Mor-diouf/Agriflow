"""
SM10 Module 3 -- Lecture des résultats produits par les évaluations (Phase I) :
prévisions out-of-sample par zone et benchmark global des modèles.
"""

import os

import pandas as pd

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")

# Niveau de prévision -> colonne du fichier de prédictions
FORECAST_LEVELS = {
    "central": "pred_sarimax",   # Hurdle-SARIMAX(1,0,0)+Exog
    "prudent": "pred_q75",       # Hurdle-Quantile(0.75)
    "stress": "pred_q90",        # Hurdle-Quantile(0.90)
}


def load_oos_predictions() -> pd.DataFrame:
    """Prédictions out-of-sample hebdomadaires par zone (colonnes fold, zone, semaine, y_true, pred_*)."""
    return pd.read_csv(os.path.join(RESULTS_DIR, "quantile_oos_predictions.csv"), encoding="utf-8")


def load_global_benchmark() -> pd.DataFrame:
    """Métriques globales (MAE, RMSE, biais, couverture…) de chaque modèle."""
    return pd.read_csv(os.path.join(RESULTS_DIR, "benchmark_global_phase_i.csv"), encoding="utf-8")
