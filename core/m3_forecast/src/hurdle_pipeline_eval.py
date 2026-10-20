"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : hurdle_pipeline_eval.py

Protocole Officiel d'Évaluation Walk-Forward pour le Pipeline Hurdle (Étage 1 * Étage 2).
Compare rigoureusement :
1. M0a: Persistance (baseline unifiée Y_{t-1})
2. M1a: Hurdle-Ridge naïf (sans correction de retransformation)
3. M1a: Hurdle-Ridge + Duan (avec smearing estimator non-paramétrique)
4. M1b: Hurdle-Random Forest

Produit :
- Le benchmark global (toutes semaines confondues)
- Le benchmark conditionnel strict (Y_true > 0 avec Persistance)
- La décomposition par strates de volume (Faible, Moyen, Pics)
=============================================================================
"""

import os
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from sklearn.linear_model import LogisticRegression
from src.features import engineer_features
from src.regression_models import HurdleStage2Ridge, HurdleStage2RF
from src.hurdle_stage1_eval import find_youden_index
from src.evaluation import calculate_metrics

def evaluate_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Calcule MAE, RMSE, Biais et MAPE (sur les non-nuls)."""
    return calculate_metrics(y_true, y_pred)

def run_hurdle_pipeline_evaluation(df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Exécute l'évaluation selon le protocole officiel walk-forward à fenêtre expansive.
    Retourne :
    - df_all_preds : toutes les prédictions observation par observation
    - df_global : tableau benchmark global
    - df_conditional : tableau benchmark conditionnel (Y_true > 0)
    - df_strata : tableau par strates de volume
    """
    years = sorted(df['annee'].unique())
    if len(years) < 2:
        raise ValueError("Historique insuffisant pour walk-forward (minimum 2 saisons requises).")
        
    df = engineer_features(df)
    df['y_binary'] = (df['Y'] > 0).astype(int)
    spline_cols = [c for c in df.columns if c.startswith('bs(')]
    
    all_records = []
    
    # Validation Walk-Forward temporelle stricte
    for test_idx in range(1, len(years)):
        train_years = years[:test_idx]
        test_year = years[test_idx]
        
        df_train = df[df['annee'].isin(train_years)]
        df_test = df[df['annee'] == test_year]
        
        for zone in df['zone'].unique():
            dz_train = df_train[df_train['zone'] == zone].sort_values('t_global').copy()
            dz_test = df_test[df_test['zone'] == zone].sort_values('t_global').copy()
            n_test = len(dz_test)
            
            # --- 1. PERSISTANCE BASELINE (Y_{t-1}) ---
            last_y = dz_train['Y'].iloc[-1] if not dz_train.empty else 0.0
            y_pred_pers = np.zeros(n_test)
            for i in range(n_test):
                y_pred_pers[i] = last_y
                last_y = dz_test['Y'].iloc[i]
                
            # --- 2. ÉTAGE 1 (Classification présence/absence de récolte) ---
            X1_train = dz_train[spline_cols].values
            y1_train = dz_train['y_binary'].values
            
            clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
            clf.fit(X1_train, y1_train)
            
            y_prob_train = clf.predict_proba(X1_train)[:, 1]
            optimal_thresh = find_youden_index(y1_train, y_prob_train)
            
            X1_test = dz_test[spline_cols].values
            y_prob_test = clf.predict_proba(X1_test)[:, 1]
            mask_pred = (y_prob_test >= optimal_thresh).astype(int)
            
            # --- 3. ÉTAGE 2 (Régression conditionnelle log(Y)) ---
            # Ridge : modèle unique entraîné avec calcul des résidus et du facteur Duan
            ridge_model = HurdleStage2Ridge(alpha=1.0, use_duan=True)
            ridge_model.fit(dz_train, zone)
            
            y_cond_ridge_naive = ridge_model.predict_naive(dz_test, zone)
            y_cond_ridge_duan = ridge_model.predict_duan(dz_test, zone)
            
            # Random Forest
            rf_model = HurdleStage2RF(use_duan=False, random_state=42)
            rf_model.fit(dz_train, zone)
            y_cond_rf = rf_model.predict(dz_test, zone)
            
            # --- 4. PRÉDICTIONS COMBINÉES (Étage 1 * Étage 2) ---
            y_comb_ridge_naive = mask_pred * y_cond_ridge_naive
            y_comb_ridge_duan = mask_pred * y_cond_ridge_duan
            y_comb_rf = mask_pred * y_cond_rf
            
            # Enregistrement observation par observation
            y_true = dz_test['Y'].values
            t_globals = dz_test['t_global'].values
            weeks = dz_test['semaine'].values
            
            for i in range(n_test):
                all_records.append({
                    'fold': test_year,
                    'zone': zone,
                    't_global': t_globals[i],
                    'semaine': weeks[i],
                    'y_true': y_true[i],
                    'is_active': (y_true[i] > 0),
                    'mask_pred': mask_pred[i],
                    
                    # Prédictions conditionnelles (Étage 2 pur)
                    'cond_pers': y_pred_pers[i],
                    'cond_ridge_naive': y_cond_ridge_naive[i],
                    'cond_ridge_duan': y_cond_ridge_duan[i],
                    'cond_rf': y_cond_rf[i],
                    
                    # Prédictions combinées (Pipeline complet)
                    'comb_pers': y_pred_pers[i],
                    'comb_ridge_naive': y_comb_ridge_naive[i],
                    'comb_ridge_duan': y_comb_ridge_duan[i],
                    'comb_rf': y_comb_rf[i],
                    
                    'duan_factor': ridge_model.duan_factors_by_zone.get(zone, 1.0)
                })
                
    df_preds = pd.DataFrame(all_records)
    
    # Définition des modèles à benchmarker
    model_keys = [
        ('Persistence', 'comb_pers', 'cond_pers'),
        ('Hurdle-Ridge naïf', 'comb_ridge_naive', 'cond_ridge_naive'),
        ('Hurdle-Ridge + Duan', 'comb_ridge_duan', 'cond_ridge_duan'),
        ('Hurdle-Random Forest', 'comb_rf', 'cond_rf')
    ]
    
    # ---------------------------------------------------------
    # A. TABLEAU 1 : BENCHMARK GLOBAL (Toutes semaines)
    # ---------------------------------------------------------
    global_rows = []
    for name, comb_col, _ in model_keys:
        mets = calculate_metrics(df_preds['y_true'].values, df_preds[comb_col].values)
        global_rows.append({
            'Modèle': name,
            'MAE': mets['MAE'],
            'RMSE': mets['RMSE'],
            'Biais': mets['Bias'],
            'MAPE (%)': mets['MAPE']
        })
    df_global = pd.DataFrame(global_rows)
    
    # ---------------------------------------------------------
    # B. TABLEAU 2 : BENCHMARK CONDITIONNEL (Y_true > 0)
    # ---------------------------------------------------------
    df_active = df_preds[df_preds['is_active']].copy()
    cond_rows = []
    for name, _, cond_col in model_keys:
        mets = calculate_metrics(df_active['y_true'].values, df_active[cond_col].values)
        cond_rows.append({
            'Modèle': name,
            'MAE conditionnel': mets['MAE'],
            'RMSE conditionnel': mets['RMSE'],
            'Biais conditionnel': mets['Bias'],
            'MAPE conditionnel (%)': mets['MAPE']
        })
    df_conditional = pd.DataFrame(cond_rows)
    
    # ---------------------------------------------------------
    # C. TABLEAU 3 : ANALYSE PAR STRATES DE VOLUME (Y_true > 0)
    # ---------------------------------------------------------
    q50 = float(df_active['y_true'].median())
    q80 = float(df_active['y_true'].quantile(0.80))
    
    bins = [0, q50, q80, 1e6]
    labels = [
        f'Faible volume (<= {q50:.1f} t)',
        f'Volume moyen ({q50:.1f} - {q80:.1f} t)',
        f'Gros volume / pics (> {q80:.1f} t)'
    ]
    df_active['strata'] = pd.cut(df_active['y_true'], bins=bins, labels=labels)
    
    strata_rows = []
    for stratum_name in labels:
        sub = df_active[df_active['strata'] == stratum_name]
        n_obs = len(sub)
        for name, _, cond_col in model_keys:
            mets = calculate_metrics(sub['y_true'].values, sub[cond_col].values)
            strata_rows.append({
                'Strate': stratum_name,
                'N_obs': n_obs,
                'Modèle': name,
                'MAE': mets['MAE'],
                'RMSE': mets['RMSE'],
                'Biais': mets['Bias']
            })
    df_strata = pd.DataFrame(strata_rows)
    
    return df_preds, df_global, df_conditional, df_strata

if __name__ == '__main__':
    print("=" * 78)
    print("  SM10 Agro — Évaluation Walk-Forward Officielle (Phase F Consolidée)")
    print("=" * 78)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
    df = pd.read_csv(data_path)
    
    df_preds, df_global, df_cond, df_strata = run_hurdle_pipeline_evaluation(df)
    
    print("\n" + "=" * 78)
    print("  1. BENCHMARK GLOBAL OFFICIEL (Walk-Forward Strict, Toutes Semaines)")
    print("=" * 78)
    print(df_global.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n" + "=" * 78)
    print("  2. BENCHMARK CONDITIONNEL OFFICIEL (Étage 2 pur sur Y_true > 0)")
    print("=" * 78)
    print(df_cond.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n" + "=" * 78)
    print("  3. ANALYSE PAR STRATES DE VOLUME (Étage 2 sur Y_true > 0)")
    print("=" * 78)
    print(df_strata.to_string(index=False, float_format="{:7.3f}".format))
    
    # Sauvegarde des résultats officiels
    results_dir = os.path.join(base_dir, 'results')
    os.makedirs(results_dir, exist_ok=True)
    df_global.to_csv(os.path.join(results_dir, 'benchmark_global_phase_f.csv'), index=False)
    df_cond.to_csv(os.path.join(results_dir, 'benchmark_conditionnel_phase_f.csv'), index=False)
    df_strata.to_csv(os.path.join(results_dir, 'benchmark_strates_volume_phase_f.csv'), index=False)
    print(f"\n[OK] Résultats officiels exportés dans {results_dir}")
