"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : evaluation.py

Framework de validation Walk-Forward (Expanding Window).
Calcul des métriques de performance et Skill Score.
=============================================================================
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
from src.baseline_models import BaselineModel

def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Calcule MAE, RMSE, Biais (Mean Error), MAPE et MdAPE (sur Y>0)."""
    mae = np.mean(np.abs(y_true - y_pred))
    rmse = np.sqrt(np.mean((y_true - y_pred)**2))
    bias = np.mean(y_pred - y_true)
    
    # MAPE et MdAPE calculés uniquement quand Y > 0 pour éviter division par zéro
    mask_active = y_true > 0
    if np.any(mask_active):
        ape = np.abs((y_true[mask_active] - y_pred[mask_active]) / y_true[mask_active]) * 100
        mape = np.mean(ape)
        mdape = np.median(ape)
    else:
        mape = np.nan
        mdape = np.nan
        
    return {'MAE': mae, 'RMSE': rmse, 'Bias': bias, 'MAPE': mape, 'MdAPE': mdape}

def run_walk_forward(df: pd.DataFrame, models: List[BaselineModel]) -> pd.DataFrame:
    """
    Exécute la validation croisée walk-forward temporelle sur 5 saisons.
    S1 -> S2
    S1,S2 -> S3
    S1,S2,S3 -> S4
    S1..S4 -> S5
    """
    years = sorted(df['annee'].unique())
    if len(years) < 2:
        raise ValueError("Historique insuffisant pour walk-forward (min 2 saisons requises).")
        
    results_records = []
    
    # Validation Walk-Forward
    for test_idx in range(1, len(years)):
        train_years = years[:test_idx]
        test_year = years[test_idx]
        
        df_train = df[df['annee'].isin(train_years)]
        df_test = df[df['annee'] == test_year]
        
        for model in models:
            metrics_fold = []
            
            for zone in df['zone'].unique():
                # Entraînement
                model.fit(df_train, zone)
                # Prédiction
                preds = model.predict(df_test, zone)
                
                # Évaluation
                dz_test = df_test[df_test['zone'] == zone].sort_values('t_global')
                y_true = dz_test['Y'].values
                metrics = calculate_metrics(y_true, preds)
                
                results_records.append({
                    'Fold': f"Test={test_year}",
                    'Model': model.name,
                    'Zone': zone,
                    'MAE': metrics['MAE'],
                    'RMSE': metrics['RMSE'],
                    'Bias': metrics['Bias'],
                    'MAPE': metrics['MAPE'],
                    'MdAPE': metrics['MdAPE']
                })

    return pd.DataFrame(results_records)

def aggregate_and_skill_score(results_df: pd.DataFrame, reference_model: str = "M0b: Naif Saisonnier") -> pd.DataFrame:
    """
    Agrège les résultats par modèle sur tous les folds et zones.
    Calcule le Skill Score par rapport au modèle de référence.
    """
    agg = results_df.groupby('Model')[['MAE', 'RMSE', 'Bias', 'MAPE', 'MdAPE']].mean().reset_index()
    
    # Calcul du Skill Score
    if reference_model in agg['Model'].values:
        ref_mae = agg.loc[agg['Model'] == reference_model, 'MAE'].values[0]
        agg['Skill_Score'] = 1.0 - (agg['MAE'] / ref_mae)
        # Par convention, le SS du modèle de référence est exactement 0
        agg.loc[agg['Model'] == reference_model, 'Skill_Score'] = 0.0
    else:
        agg['Skill_Score'] = np.nan
        
    # Formatage de l'affichage
    agg = agg.sort_values('MAE').reset_index(drop=True)
    return agg

if __name__ == '__main__':
    from src.baseline_models import NaivePersistence, SeasonalNaive, MovingAverage, LinearTrend
    import os
    
    # 1. Chargement
    print("=" * 70)
    print("  SM10 Agro — Évaluation Walk-Forward (Modèles de Base)")
    print("=" * 70)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    df = pd.read_csv(os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv'))
    
    # 2. Modèles à tester
    models = [
        NaivePersistence(),
        SeasonalNaive(),
        MovingAverage(k=4),
        LinearTrend()
    ]
    
    # 3. Exécution
    print(f"Lancement du Walk-Forward sur {len(models)} modèles et 5 saisons...")
    raw_results = run_walk_forward(df, models)
    
    # 4. Synthèse et Skill Score
    summary = aggregate_and_skill_score(raw_results)
    
    print("\n--- SYNTHÈSE DES PERFORMANCES (Moyenne sur 4 folds de test) ---")
    print(summary.to_string(index=False, float_format="{:.3f}".format))
    
    print("\n" + "=" * 70)
    print("  Évaluation Terminée.")
    print("=" * 70)
