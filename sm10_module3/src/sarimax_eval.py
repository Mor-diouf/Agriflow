"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : sarimax_eval.py

Protocole Officiel d'Évaluation Walk-Forward pour la Phase H (SARIMAX).
Compare rigoureusement :
1. Persistence (Baseline temporelle Y_{t-1})
2. Hurdle-Ridge + Duan (Référence Phase F : régression statique exogène)
3. Hurdle-SARIMAX(1,0,0)+Exog (Modèle dynamique exogène complet avec filtre de Kalman)
4. SARIMAX(1,0,0)+Exog (Pur sans masque hurdle, pour isoler l'effet hurdle)
5. AR(1) Pur (Série brute sans exogènes, pour isoler l'apport des exogènes)

Garantit :
- Mêmes plis OOS : 2022, 2023, 2024, 2025
- Zéro fuite temporelle
- Analyse approfondie des pics (> 49.9 t)
=============================================================================
"""

import os
import sys
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from sklearn.linear_model import LogisticRegression

# Import interne du projet
from src.features import engineer_features, OPTIMAL_LAGS
from src.regression_models import HurdleStage2Ridge
from src.time_series_models import SARIMAXForecaster
from src.hurdle_stage1_eval import find_youden_index
from src.evaluation import calculate_metrics

def run_phase_h_evaluation(df: pd.DataFrame):
    """
    Exécute le benchmark officiel de la Phase H.
    """
    years = sorted(df['annee'].unique())
    if len(years) < 2:
        raise ValueError("Historique insuffisant pour le walk-forward.")
        
    df_feat = engineer_features(df)
    df_feat['y_binary'] = (df_feat['Y'] > 0).astype(int)
    spline_cols = [c for c in df_feat.columns if c.startswith('bs(')]
    
    all_records = []
    metadata_records = []
    
    for test_idx in range(1, len(years)):
        train_years = years[:test_idx]
        test_year = years[test_idx]
        
        df_train = df_feat[df_feat['annee'].isin(train_years)].copy()
        df_test = df_feat[df_feat['annee'] == test_year].copy()
        
        for zone in df_feat['zone'].unique():
            dz_train = df_train[df_train['zone'] == zone].sort_values('t_global').copy()
            dz_test = df_test[df_test['zone'] == zone].sort_values('t_global').copy()
            n_test = len(dz_test)
            
            # -------------------------------------------------------------
            # 1. BASELINE PERSISTENCE (Y_{t-1})
            # -------------------------------------------------------------
            last_y = dz_train['Y'].iloc[-1] if not dz_train.empty else 0.0
            y_pred_pers = np.zeros(n_test)
            for i in range(n_test):
                y_pred_pers[i] = last_y
                last_y = dz_test['Y'].iloc[i]
                
            # -------------------------------------------------------------
            # 2. ÉTAGE 1 : Classificateur Logistique Hurdle
            # -------------------------------------------------------------
            X1_train = dz_train[spline_cols].values
            y1_train = dz_train['y_binary'].values
            
            clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
            clf.fit(X1_train, y1_train)
            
            y_prob_train = clf.predict_proba(X1_train)[:, 1]
            optimal_thresh = find_youden_index(y1_train, y_prob_train)
            
            X1_test = dz_test[spline_cols].values
            y_prob_test = clf.predict_proba(X1_test)[:, 1]
            mask_pred = (y_prob_test >= optimal_thresh).astype(int)
            
            # -------------------------------------------------------------
            # 3. RÉFÉRENCE PHASE F : Hurdle-Ridge + Duan
            # -------------------------------------------------------------
            ridge = HurdleStage2Ridge(alpha=1.0, use_duan=True)
            ridge.fit(dz_train, zone)
            y_cond_ridge = ridge.predict_duan(dz_test, zone)
            y_comb_ridge = mask_pred * y_cond_ridge
            
            # -------------------------------------------------------------
            # 4. MODÈLES TEMPORELS (PHASE H)
            # -------------------------------------------------------------
            # A. SARIMAX Complet (AR(1) + Fourier + Météo + Tendance)
            sarimax_full = SARIMAXForecaster(
                order=(1, 0, 0),
                use_fourier=True,
                use_meteo=True,
                use_trend=True,
                name="SARIMAX(1,0,0)+Exog"
            )
            sarimax_full.fit(dz_train, zone)
            y_pred_sarimax_raw = sarimax_full.predict(dz_test, zone)
            y_comb_sarimax = mask_pred * y_pred_sarimax_raw
            
            # B. AR(1) Pur sans exogènes (pour mesurer l'apport de la météo/saison)
            ar_pure = SARIMAXForecaster(
                order=(1, 0, 0),
                use_fourier=False,
                use_meteo=False,
                use_trend=False,
                name="AR(1) Pur"
            )
            ar_pure.fit(dz_train, zone)
            y_pred_ar_raw = ar_pure.predict(dz_test, zone)
            y_comb_ar = mask_pred * y_pred_ar_raw
            
            # Enregistrement des prédictions observation par observation
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
                    
                    # Prédictions globales (Pipeline combiné)
                    'comb_pers': y_pred_pers[i],
                    'comb_ridge_duan': y_comb_ridge[i],
                    'comb_sarimax': y_comb_sarimax[i],
                    'comb_sarimax_raw': y_pred_sarimax_raw[i],
                    'comb_ar_pure': y_comb_ar[i],
                    
                    # Prédictions conditionnelles (Étage 2 pur)
                    'cond_pers': y_pred_pers[i],
                    'cond_ridge_duan': y_cond_ridge[i],
                    'cond_sarimax': y_pred_sarimax_raw[i],
                    'cond_ar_pure': y_pred_ar_raw[i]
                })
                
            metadata_records.append({
                'fold': test_year,
                'zone': zone,
                'n_train': len(dz_train),
                'aic_sarimax': sarimax_full.fit_metadata[zone]['aic'],
                'ar_param': sarimax_full.fit_metadata[zone]['ar_params'][0] if sarimax_full.fit_metadata[zone]['ar_params'] else np.nan
            })
            
    df_preds = pd.DataFrame(all_records)
    df_meta = pd.DataFrame(metadata_records)
    
    # Modèles officiels de comparaison
    models = [
        ('Persistence', 'comb_pers', 'cond_pers'),
        ('Hurdle-Ridge + Duan', 'comb_ridge_duan', 'cond_ridge_duan'),
        ('Hurdle-SARIMAX(1,0,0)', 'comb_sarimax', 'cond_sarimax'),
        ('SARIMAX Pur (sans hurdle)', 'comb_sarimax_raw', 'cond_sarimax'),
        ('Hurdle-AR(1) Pur', 'comb_ar_pure', 'cond_ar_pure')
    ]
    
    # -------------------------------------------------------------
    # A. BENCHMARK GLOBAL (1040 observations OOS)
    # -------------------------------------------------------------
    global_rows = []
    for name, comb_col, _ in models:
        mets = calculate_metrics(df_preds['y_true'].values, df_preds[comb_col].values)
        global_rows.append({
            'Modèle': name,
            'MAE': mets['MAE'],
            'RMSE': mets['RMSE'],
            'Biais': mets['Bias'],
            'MAPE (%)': mets['MAPE']
        })
    df_global = pd.DataFrame(global_rows)
    
    # -------------------------------------------------------------
    # B. BENCHMARK CONDITIONNEL (Y_true > 0, 541 observations)
    # -------------------------------------------------------------
    df_active = df_preds[df_preds['is_active']].copy()
    cond_rows = []
    for name, _, cond_col in models:
        mets = calculate_metrics(df_active['y_true'].values, df_active[cond_col].values)
        cond_rows.append({
            'Modèle': name,
            'MAE cond': mets['MAE'],
            'RMSE cond': mets['RMSE'],
            'Biais cond': mets['Bias'],
            'MAPE cond (%)': mets['MAPE']
        })
    df_cond = pd.DataFrame(cond_rows)
    
    # -------------------------------------------------------------
    # C. ANALYSE PAR STRATES DE VOLUME (Faible, Moyen, Pics)
    # -------------------------------------------------------------
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
    for s_name in labels:
        sub = df_active[df_active['strata'] == s_name]
        for name, _, cond_col in models:
            mets = calculate_metrics(sub['y_true'].values, sub[cond_col].values)
            strata_rows.append({
                'Strate': s_name,
                'N_obs': len(sub),
                'Modèle': name,
                'MAE': mets['MAE'],
                'RMSE': mets['RMSE'],
                'Biais': mets['Bias']
            })
    df_strata = pd.DataFrame(strata_rows)
    
    # -------------------------------------------------------------
    # D. ANALYSE PAR ZONE
    # -------------------------------------------------------------
    zone_rows = []
    for zone in sorted(df_preds['zone'].unique()):
        sub_z = df_preds[df_preds['zone'] == zone]
        for name, comb_col, _ in models[:3]: # Persistence, Ridge+Duan, Hurdle-SARIMAX
            mets = calculate_metrics(sub_z['y_true'].values, sub_z[comb_col].values)
            zone_rows.append({
                'Zone': zone,
                'Modèle': name,
                'MAE': mets['MAE'],
                'RMSE': mets['RMSE'],
                'Biais': mets['Bias']
            })
    df_zone = pd.DataFrame(zone_rows)
    
    # -------------------------------------------------------------
    # E. ANALYSE PAR ANNÉE
    # -------------------------------------------------------------
    year_rows = []
    for y in sorted(df_preds['fold'].unique()):
        sub_y = df_preds[df_preds['fold'] == y]
        for name, comb_col, _ in models[:3]:
            mets = calculate_metrics(sub_y['y_true'].values, sub_y[comb_col].values)
            year_rows.append({
                'Année': y,
                'Modèle': name,
                'MAE': mets['MAE'],
                'RMSE': mets['RMSE'],
                'Biais': mets['Bias']
            })
    df_year = pd.DataFrame(year_rows)
    
    return df_preds, df_global, df_cond, df_strata, df_zone, df_year, df_meta

if __name__ == '__main__':
    print("=" * 78)
    print("  SM10 Agro — Évaluation Walk-Forward Phase H (SARIMAX)")
    print("=" * 78)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
    df = pd.read_csv(data_path)
    
    df_preds, df_glob, df_cond, df_strat, df_zone, df_year, df_meta = run_phase_h_evaluation(df)
    
    # Sauvegarde des résultats
    res_dir = os.path.join(base_dir, 'results')
    os.makedirs(res_dir, exist_ok=True)
    
    df_preds.to_csv(os.path.join(res_dir, 'sarimax_oos_predictions.csv'), index=False)
    df_glob.to_csv(os.path.join(res_dir, 'benchmark_global_phase_h.csv'), index=False)
    df_cond.to_csv(os.path.join(res_dir, 'benchmark_conditionnel_phase_h.csv'), index=False)
    df_strat.to_csv(os.path.join(res_dir, 'benchmark_strates_volume_phase_h.csv'), index=False)
    df_zone.to_csv(os.path.join(res_dir, 'benchmark_par_zone_phase_h.csv'), index=False)
    df_year.to_csv(os.path.join(res_dir, 'benchmark_par_annee_phase_h.csv'), index=False)
    
    print("\n--- 1. BENCHMARK GLOBAL (POOLED 1040 OBS) ---")
    print(df_glob.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 2. BENCHMARK CONDITIONNEL (Y > 0, 541 OBS) ---")
    print(df_cond.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 3. ANALYSE SPÉCIFIQUE DES PICS (> 49.9 t) ---")
    pics = df_strat[df_strat['Strate'].str.contains('Gros')]
    print(pics[['Modèle', 'N_obs', 'MAE', 'RMSE', 'Biais']].to_string(index=False, float_format="{:7.3f}".format))
    
    print(f"\n[OK] Tous les résultats de la Phase H ont été exportés dans {res_dir}")
