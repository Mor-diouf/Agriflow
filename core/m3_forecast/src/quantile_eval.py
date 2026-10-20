"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : quantile_eval.py

Protocole Officiel d'Évaluation Walk-Forward pour la Phase I :
Calibration des hauts volumes via Régression Quantile (q=0.50, 0.75, 0.90).

Compare rigoureusement :
1. Persistence (Baseline temporelle)
2. Hurdle-SARIMAX(1,0,0)+Exog (Référence officielle Phase H)
3. Hurdle-Quantile(0.50) (Prévision médiane / perte L1)
4. Hurdle-Quantile(0.75) (Prévision quantile 75%)
5. Hurdle-Quantile(0.90) (Prévision quantile 90% / plafond de capacité)

Garantit :
- Mêmes plis OOS : 2022, 2023, 2024, 2025
- Même ensemble de features exogènes (Fourier, Météo, Tendance, Mémoire Y_{t-1})
- Zéro fuite temporelle
- Réarrangement monotone (Chernozhukov et al., 2010)
- Évaluation complète : MAE, RMSE, Biais, MAPE, Couverture empirique,
  Conditionnel, Pics (> 49.9 t), D9/D10, Épisodes de pic, Par zone et Par année.
=============================================================================
"""

import os
import sys
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from sklearn.linear_model import LogisticRegression
import statsmodels.api as sm
from statsmodels.regression.quantile_regression import QuantReg

# Imports internes
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from src.features import engineer_features, OPTIMAL_LAGS
from src.hurdle_stage1_eval import find_youden_index
from src.evaluation import calculate_metrics

def prepare_quantile_exog(dz: pd.DataFrame, zone: str) -> pd.DataFrame:
    """
    Construit la matrice des variables exogènes strictement disponibles à t.
    Spécification identique aux informations disponibles dans SARIMAX :
    - Harmoniques de Fourier (saisonnalité s=52, ordres 1 et 2)
    - Pluie retardée causale P_{t - l^*}
    - Température lissée T_{roll4}
    - Tendance temporelle normalisée (t_global / 52.0)
    - Mémoire temporelle autorégressive : Y_{t-1} strictly lagged
    """
    w = dz['semaine'].values
    lag = OPTIMAL_LAGS.get(zone, 6)
    
    exog_data = {
        'sin1': np.sin(2 * np.pi * w / 52.0),
        'cos1': np.cos(2 * np.pi * w / 52.0),
        'sin2': np.sin(4 * np.pi * w / 52.0),
        'cos2': np.cos(4 * np.pi * w / 52.0),
        'P_lag': dz['P'].shift(lag).fillna(0.0).values,
        'T_roll4': dz['T'].rolling(window=4, min_periods=1).mean().values,
        'trend_norm': (dz['t_global'].values / 52.0),
        'y_lag1': dz['Y'].shift(1).fillna(0.0).values
    }
    return pd.DataFrame(exog_data, index=dz.index)

def run_phase_i_evaluation(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Exécute le benchmark walk-forward complet pour la Phase I.
    """
    # Charger les prédictions officielles de la Phase H pour garantir 100% de concordance
    sarimax_oos_path = os.path.join(base_dir, 'results', 'sarimax_oos_predictions.csv')
    if os.path.exists(sarimax_oos_path):
        df_sarimax = pd.read_csv(sarimax_oos_path)
    else:
        df_sarimax = None
        
    df_feat = engineer_features(df_raw)
    df_feat['y_binary'] = (df_feat['Y'] > 0).astype(int)
    spline_cols = [c for c in df_feat.columns if c.startswith('bs(')]
    
    years = sorted(df_raw['annee'].unique())
    all_records = []
    
    for test_idx in range(1, len(years)):
        train_years = years[:test_idx]
        test_year = years[test_idx]
        
        df_train = df_feat[df_feat['annee'].isin(train_years)].copy()
        df_test = df_feat[df_feat['annee'] == test_year].copy()
        
        for zone in sorted(df_raw['zone'].unique()):
            dz_train = df_train[df_train['zone'] == zone].sort_values('t_global').copy()
            dz_test = df_test[df_test['zone'] == zone].sort_values('t_global').copy()
            n_train = len(dz_train)
            n_test = len(dz_test)
            
            y_train = dz_train['Y'].values.astype(float)
            y_test = dz_test['Y'].values.astype(float)
            
            # --- 0. Persistence (Y_{t-1}) ---
            last_y = y_train[-1] if len(y_train) > 0 else 0.0
            y_pred_pers = np.zeros(n_test)
            for i in range(n_test):
                y_pred_pers[i] = last_y
                last_y = y_test[i]
                
            # --- Étage 1 : Masque Hurdle Logistique ---
            clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
            clf.fit(dz_train[spline_cols].values, dz_train['y_binary'].values)
            y_prob_train = clf.predict_proba(dz_train[spline_cols].values)[:, 1]
            optimal_thresh = find_youden_index(dz_train['y_binary'].values, y_prob_train)
            mask_pred = (clf.predict_proba(dz_test[spline_cols].values)[:, 1] >= optimal_thresh).astype(int)
            
            # --- Étage 2 : Régression Quantile (q=0.50, 0.75, 0.90) ---
            # Concaténation train + test pour assurer la continuité temporelle exacte de shift(1)
            dz_full = pd.concat([dz_train, dz_test]).sort_values('t_global')
            exog_full = prepare_quantile_exog(dz_full, zone)
            
            X_train_df = exog_full.iloc[:n_train]
            X_test_df = exog_full.iloc[n_train:]
            
            X_tr_const = sm.add_constant(X_train_df.values)
            X_te_const = sm.add_constant(X_test_df.values)
            
            raw_q_preds = {}
            for q in [0.50, 0.75, 0.90]:
                mod = QuantReg(y_train, X_tr_const)
                res = mod.fit(q=q, max_iter=2500)
                raw_q_preds[q] = np.maximum(0.0, res.predict(X_te_const))
                
            # Réarrangement monotone (Chernozhukov et al., 2010)
            # Garantit q0.50 <= q0.75 <= q0.90 sans croisement
            stacked_preds = np.stack([raw_q_preds[0.50], raw_q_preds[0.75], raw_q_preds[0.90]], axis=1)
            sorted_preds = np.sort(stacked_preds, axis=1)
            
            y_cond_q50 = sorted_preds[:, 0]
            y_cond_q75 = sorted_preds[:, 1]
            y_cond_q90 = sorted_preds[:, 2]
            
            y_comb_q50 = mask_pred * y_cond_q50
            y_comb_q75 = mask_pred * y_cond_q75
            y_comb_q90 = mask_pred * y_cond_q90
            
            # Récupérer la prévision SARIMAX de référence
            if df_sarimax is not None:
                sub_sar = df_sarimax[(df_sarimax['fold'] == test_year) & (df_sarimax['zone'] == zone)].sort_values('t_global')
                y_comb_sarimax = sub_sar['comb_sarimax'].values
            else:
                y_comb_sarimax = np.zeros(n_test)
                
            for i in range(n_test):
                all_records.append({
                    'fold': test_year,
                    'zone': zone,
                    't_global': dz_test['t_global'].iloc[i],
                    'semaine': dz_test['semaine'].iloc[i],
                    'y_true': y_test[i],
                    'is_active': (y_test[i] > 0),
                    'mask_pred': mask_pred[i],
                    
                    'pred_pers': y_pred_pers[i],
                    'pred_sarimax': y_comb_sarimax[i],
                    'pred_q50': y_comb_q50[i],
                    'pred_q75': y_comb_q75[i],
                    'pred_q90': y_comb_q90[i],
                    
                    'cond_q50': y_cond_q50[i],
                    'cond_q75': y_cond_q75[i],
                    'cond_q90': y_cond_q90[i]
                })
                
    df_preds = pd.DataFrame(all_records)
    
    # Détection des épisodes de pics (> 49.9 t)
    df_preds = df_preds.sort_values(['zone', 't_global']).reset_index(drop=True)
    df_preds['is_pic'] = (df_preds['y_true'] > 49.9)
    
    pic_pos = []
    for zone in df_preds['zone'].unique():
        sub = df_preds[df_preds['zone'] == zone]
        pos = 0
        for is_p in sub['is_pic']:
            if is_p:
                pos += 1
                if pos == 1:
                    pic_pos.append('Semaine 1 (Entrée)')
                elif pos == 2:
                    pic_pos.append('Semaine 2 consécutive')
                else:
                    pic_pos.append('Semaine 3+ consécutive')
            else:
                pos = 0
                pic_pos.append('Hors pic')
    df_preds['pic_position'] = pic_pos
    
    # Calcul des déciles D9 et D10 sur la série active (Y > 0)
    y_active = df_preds[df_preds['is_active']]['y_true'].values
    q80 = np.quantile(y_active, 0.80)
    q90 = np.quantile(y_active, 0.90)
    
    df_preds['decile'] = 'D1-D8'
    df_preds.loc[df_preds['is_active'] & (df_preds['y_true'] >= q80) & (df_preds['y_true'] < q90), 'decile'] = 'D9'
    df_preds.loc[df_preds['is_active'] & (df_preds['y_true'] >= q90), 'decile'] = 'D10'
    
    return df_preds

def pinball_loss(y_true: np.ndarray, y_pred: np.ndarray, q: float) -> float:
    """Calcule la perte pinball (Koenker-Bassett) pour un quantile q."""
    u = y_true - y_pred
    return float(np.mean(np.maximum(q * u, (q - 1.0) * u)))

def wilson_ci(k: int, n: int, alpha: float = 0.05) -> Tuple[float, float]:
    """Intervalle de confiance Wilson à 95% pour une proportion."""
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    z = 1.959963984540054  # stats.norm.ppf(1 - alpha/2)
    denom = 1.0 + (z**2) / n
    center = (p + (z**2) / (2.0 * n)) / denom
    spread = (z * np.sqrt((p * (1.0 - p) / n) + (z**2) / (4.0 * (n**2)))) / denom
    return (max(0.0, float(center - spread)), min(1.0, float(center + spread)))

def compute_phase_i_benchmarks(df_preds: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """
    Calcule l'ensemble des benchmarks demandés pour la Phase I.
    """
    models = [
        ('Persistence', 'pred_pers'),
        ('Hurdle-SARIMAX(1,0,0)+Exog', 'pred_sarimax'),
        ('Hurdle-Quantile(0.50)', 'pred_q50'),
        ('Hurdle-Quantile(0.75)', 'pred_q75'),
        ('Hurdle-Quantile(0.90)', 'pred_q90')
    ]
    
    # -------------------------------------------------------------
    # 1. GLOBAL (1040 obs)
    # -------------------------------------------------------------
    glob_rows = []
    y_true = df_preds['y_true'].values
    n_glob = len(y_true)
    for name, col in models:
        y_p = df_preds[col].values
        m = calculate_metrics(y_true, y_p)
        cov = np.mean(y_true <= y_p) * 100.0
        glob_rows.append({
            'Modèle': name,
            'MAE': m['MAE'],
            'RMSE': m['RMSE'],
            'Biais': m['Bias'],
            'MAPE (%)': m['MAPE'],
            'PL_0.50': pinball_loss(y_true, y_p, 0.50),
            'PL_0.75': pinball_loss(y_true, y_p, 0.75),
            'PL_0.90': pinball_loss(y_true, y_p, 0.90),
            'Couverture (%)': cov
        })
    df_global = pd.DataFrame(glob_rows)
    
    # -------------------------------------------------------------
    # 2. CONDITIONNEL (Y_true > 0, 541 obs)
    # -------------------------------------------------------------
    df_act = df_preds[df_preds['is_active']].copy()
    y_act = df_act['y_true'].values
    cond_rows = []
    for name, col in models:
        y_p = df_act[col].values
        m = calculate_metrics(y_act, y_p)
        cov = np.mean(y_act <= y_p) * 100.0
        cond_rows.append({
            'Modèle': name,
            'MAE cond': m['MAE'],
            'RMSE cond': m['RMSE'],
            'Biais cond': m['Bias'],
            'PL_0.50 cond': pinball_loss(y_act, y_p, 0.50),
            'PL_0.75 cond': pinball_loss(y_act, y_p, 0.75),
            'PL_0.90 cond': pinball_loss(y_act, y_p, 0.90),
            'Couverture cond (%)': cov
        })
    df_cond = pd.DataFrame(cond_rows)
    
    # -------------------------------------------------------------
    # 3. PICS (Y_true > 49.9 t, EXACTEMENT 109 observations)
    # -------------------------------------------------------------
    df_pics = df_preds[df_preds['is_pic']].copy()
    y_pics = df_pics['y_true'].values
    n_pics = len(y_pics)  # Doit être 109
    pic_rows = []
    for name, col in models:
        y_p = df_pics[col].values
        m = calculate_metrics(y_pics, y_p)
        cov = np.mean(y_pics <= y_p) * 100.0
        pic_rows.append({
            'Modèle': name,
            'N': n_pics,
            'MAE pics': m['MAE'],
            'RMSE pics': m['RMSE'],
            'Biais pics': m['Bias'],
            'PL_0.50 pics': pinball_loss(y_pics, y_p, 0.50),
            'PL_0.75 pics': pinball_loss(y_pics, y_p, 0.75),
            'PL_0.90 pics': pinball_loss(y_pics, y_p, 0.90),
            'Couverture pics (%)': cov
        })
    df_peaks = pd.DataFrame(pic_rows)
    
    # -------------------------------------------------------------
    # 4. DECILES D9 et D10
    # -------------------------------------------------------------
    df_d9 = df_preds[df_preds['decile'] == 'D9'].copy()
    df_d10 = df_preds[df_preds['decile'] == 'D10'].copy()
    dec_rows = []
    for name, col in models:
        y_d9 = df_d9['y_true'].values
        p_d9 = df_d9[col].values
        m_d9 = calculate_metrics(y_d9, p_d9)
        cov_d9 = np.mean(y_d9 <= p_d9) * 100.0
        
        y_d10 = df_d10['y_true'].values
        p_d10 = df_d10[col].values
        m_d10 = calculate_metrics(y_d10, p_d10)
        cov_d10 = np.mean(y_d10 <= p_d10) * 100.0
        
        dec_rows.append({
            'Modèle': name,
            'D9 MAE': m_d9['MAE'],
            'D9 Biais': m_d9['Bias'],
            'D9 PL_0.75': pinball_loss(y_d9, p_d9, 0.75),
            'D9 Couv (%)': cov_d9,
            'D10 MAE': m_d10['MAE'],
            'D10 Biais': m_d10['Bias'],
            'D10 PL_0.90': pinball_loss(y_d10, p_d10, 0.90),
            'D10 Couv (%)': cov_d10
        })
    df_deciles = pd.DataFrame(dec_rows)
    
    # -------------------------------------------------------------
    # 5. ÉPISODES DE PIC (Semaine 1, Semaine 2, Semaine 3+)
    # -------------------------------------------------------------
    ep_rows = []
    for pos_name in ['Semaine 1 (Entrée)', 'Semaine 2 consécutive', 'Semaine 3+ consécutive']:
        sub_ep = df_preds[df_preds['pic_position'] == pos_name]
        n_obs = len(sub_ep)
        for name, col in models:
            if n_obs > 0:
                y_ep = sub_ep['y_true'].values
                p_ep = sub_ep[col].values
                m = calculate_metrics(y_ep, p_ep)
                cov = np.mean(y_ep <= p_ep) * 100.0
                ep_rows.append({
                    'Position': pos_name,
                    'N': n_obs,
                    'Modèle': name,
                    'MAE': m['MAE'],
                    'RMSE': m['RMSE'],
                    'Biais': m['Bias'],
                    'PL_0.90': pinball_loss(y_ep, p_ep, 0.90),
                    'Couverture (%)': cov
                })
    df_episodes = pd.DataFrame(ep_rows)
    
    # -------------------------------------------------------------
    # 6. PAR ZONE
    # -------------------------------------------------------------
    zone_rows = []
    for z in sorted(df_preds['zone'].unique()):
        sub_z = df_preds[df_preds['zone'] == z]
        for name, col in models:
            m_glob = calculate_metrics(sub_z['y_true'].values, sub_z[col].values)
            sub_pics = sub_z[sub_z['is_pic']]
            cov_glob = np.mean(sub_z['y_true'].values <= sub_z[col].values) * 100.0
            
            if len(sub_pics) > 0:
                m_pics = calculate_metrics(sub_pics['y_true'].values, sub_pics[col].values)
                cov_pics = np.mean(sub_pics['y_true'].values <= sub_pics[col].values) * 100.0
                bias_pics = m_pics['Bias']
            else:
                cov_pics = np.nan
                bias_pics = np.nan
                
            zone_rows.append({
                'Zone': z,
                'Modèle': name,
                'MAE Global': m_glob['MAE'],
                'RMSE Global': m_glob['RMSE'],
                'Biais Global': m_glob['Bias'],
                'Couv Global (%)': cov_glob,
                'N Pics': len(sub_pics),
                'Biais Pics': bias_pics,
                'Couv Pics (%)': cov_pics
            })
    df_by_zone = pd.DataFrame(zone_rows)
    
    # -------------------------------------------------------------
    # 7. PAR ANNÉE
    # -------------------------------------------------------------
    year_rows = []
    for yr in sorted(df_preds['fold'].unique()):
        sub_yr = df_preds[df_preds['fold'] == yr]
        for name, col in models:
            m_glob = calculate_metrics(sub_yr['y_true'].values, sub_yr[col].values)
            sub_pics = sub_yr[sub_yr['is_pic']]
            cov_glob = np.mean(sub_yr['y_true'].values <= sub_yr[col].values) * 100.0
            
            if len(sub_pics) > 0:
                m_pics = calculate_metrics(sub_pics['y_true'].values, sub_pics[col].values)
                cov_pics = np.mean(sub_pics['y_true'].values <= sub_pics[col].values) * 100.0
                bias_pics = m_pics['Bias']
            else:
                cov_pics = np.nan
                bias_pics = np.nan
                
            year_rows.append({
                'Année': yr,
                'Modèle': name,
                'MAE Global': m_glob['MAE'],
                'RMSE Global': m_glob['RMSE'],
                'Biais Global': m_glob['Bias'],
                'Couv Global (%)': cov_glob,
                'N Pics': len(sub_pics),
                'Biais Pics': bias_pics,
                'Couv Pics (%)': cov_pics
            })
    df_by_year = pd.DataFrame(year_rows)
    
    # -------------------------------------------------------------
    # 8. ANALYSE SPÉCIFIQUE DE CALIBRATION & INTERVALLES DE CONFIANCE (WILSON 95%)
    # -------------------------------------------------------------
    cov_rows = []
    for q_label, col, q_theo in [
        ('Hurdle-Quantile(0.50)', 'pred_q50', 50.0),
        ('Hurdle-Quantile(0.75)', 'pred_q75', 75.0),
        ('Hurdle-Quantile(0.90)', 'pred_q90', 90.0)
    ]:
        # Global
        k_glob = int(np.sum(df_preds['y_true'] <= df_preds[col]))
        n_glob = len(df_preds)
        cov_glob = (k_glob / n_glob) * 100.0
        ci_g_low, ci_g_high = wilson_ci(k_glob, n_glob)
        
        # Actif Y > 0
        k_act = int(np.sum(df_act['y_true'] <= df_act[col]))
        n_act = len(df_act)
        cov_act = (k_act / n_act) * 100.0
        ci_a_low, ci_a_high = wilson_ci(k_act, n_act)
        
        # Pics Y > 49.9 (Exactement 109 obs)
        k_pics = int(np.sum(df_pics['y_true'] <= df_pics[col]))
        n_p = len(df_pics)
        cov_pics = (k_pics / n_p) * 100.0
        ci_p_low, ci_p_high = wilson_ci(k_pics, n_p)
        
        # D9
        k_d9 = int(np.sum(df_d9['y_true'] <= df_d9[col]))
        n_d9 = len(df_d9)
        cov_d9 = (k_d9 / n_d9) * 100.0
        ci_d9_low, ci_d9_high = wilson_ci(k_d9, n_d9)
        
        # D10
        k_d10 = int(np.sum(df_d10['y_true'] <= df_d10[col]))
        n_d10 = len(df_d10)
        cov_d10 = (k_d10 / n_d10) * 100.0
        ci_d10_low, ci_d10_high = wilson_ci(k_d10, n_d10)
        
        cov_rows.append({
            'Modèle': q_label,
            'Cible (%)': q_theo,
            'Couv Globale (%)': cov_glob,
            'IC95 Globale': f"[{ci_g_low*100:.1f}%, {ci_g_high*100:.1f}%]",
            'Couv Active (%)': cov_act,
            'IC95 Active': f"[{ci_a_low*100:.1f}%, {ci_a_high*100:.1f}%]",
            'Couv Pics (%)': cov_pics,
            'IC95 Pics': f"[{ci_p_low*100:.1f}%, {ci_p_high*100:.1f}%]",
            'Couv D9 (%)': cov_d9,
            'IC95 D9': f"[{ci_d9_low*100:.1f}%, {ci_d9_high*100:.1f}%]",
            'Couv D10 (%)': cov_d10,
            'IC95 D10': f"[{ci_d10_low*100:.1f}%, {ci_d10_high*100:.1f}%]"
        })
    df_coverage = pd.DataFrame(cov_rows)
    
    return {
        'global': df_global,
        'conditional': df_cond,
        'peaks': df_peaks,
        'deciles': df_deciles,
        'episodes': df_episodes,
        'by_zone': df_by_zone,
        'by_year': df_by_year,
        'coverage': df_coverage
    }

if __name__ == '__main__':
    data_path = os.path.join(base_dir, 'data', 'raw', 'simulated_harvest_data.csv')
    print(f"Chargement des données : {data_path}")
    df_raw = pd.read_csv(data_path)
    
    print("\nLancement du benchmark walk-forward Phase I (Quantiles)...")
    df_preds = run_phase_i_evaluation(df_raw)
    
    # Sauvegarde des prédictions
    res_dir = os.path.join(base_dir, 'results')
    os.makedirs(res_dir, exist_ok=True)
    preds_out = os.path.join(res_dir, 'quantile_oos_predictions.csv')
    df_preds.to_csv(preds_out, index=False)
    print(f"Prédictions OOS enregistrées dans : {preds_out}")
    
    # Calcul des benchmarks
    benchmarks = compute_phase_i_benchmarks(df_preds)
    
    benchmarks['global'].to_csv(os.path.join(res_dir, 'benchmark_global_phase_i.csv'), index=False)
    benchmarks['conditional'].to_csv(os.path.join(res_dir, 'benchmark_conditional_phase_i.csv'), index=False)
    benchmarks['peaks'].to_csv(os.path.join(res_dir, 'benchmark_peaks_phase_i.csv'), index=False)
    benchmarks['deciles'].to_csv(os.path.join(res_dir, 'benchmark_deciles_phase_i.csv'), index=False)
    benchmarks['episodes'].to_csv(os.path.join(res_dir, 'benchmark_episodes_phase_i.csv'), index=False)
    benchmarks['by_zone'].to_csv(os.path.join(res_dir, 'benchmark_by_zone_phase_i.csv'), index=False)
    benchmarks['by_year'].to_csv(os.path.join(res_dir, 'benchmark_by_year_phase_i.csv'), index=False)
    benchmarks['coverage'].to_csv(os.path.join(res_dir, 'benchmark_coverage_phase_i.csv'), index=False)
    
    print("\n=== BENCHMARK GLOBAL PHASE I ===")
    print(benchmarks['global'].to_string(index=False))
    
    print("\n=== BENCHMARK PICS (> 49.9 t) PHASE I ===")
    print(benchmarks['peaks'].to_string(index=False))
    
    print("\n=== BENCHMARK D9 & D10 PHASE I ===")
    print(benchmarks['deciles'].to_string(index=False))
    
    print("\n=== BENCHMARK COUVERTURE & CALIBRATION PHASE I ===")
    print(benchmarks['coverage'].to_string(index=False))
