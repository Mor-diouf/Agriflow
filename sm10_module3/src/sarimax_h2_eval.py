"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : sarimax_h2_eval.py

Protocole Officiel d'Évaluation Walk-Forward pour la Phase H.2.
Compare rigoureusement :
1. Hurdle-SARIMAX(1,0,0)+Exog (Référence officielle Phase H)
2. Hurdle-SARIMAX(2,0,0)+Exog (Mémoire d'ordre 2)
3. Hurdle-SARIMAX(1,0,0)+Exog+DeltaY_{t-1} (Mémoire d'impulsion explicite)
4. Persistence (Baseline temporelle)

Objectif central :
Vérifier si p=2 ou DeltaY_{t-1} permet de réduire le retard en semaine 1
des pics et l'ACF résiduelle à lag 2, sans dégrader les autres régimes.
=============================================================================
"""

import os
import sys
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple
from scipy import stats
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.stats.diagnostic import acorr_ljungbox
from sklearn.linear_model import LogisticRegression

# Imports internes
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from src.features import engineer_features, OPTIMAL_LAGS
from src.hurdle_stage1_eval import find_youden_index
from src.evaluation import calculate_metrics

def prepare_sarimax_exog(dz: pd.DataFrame, zone: str, include_delta: bool = False) -> pd.DataFrame:
    """Prépare les exogènes strictement passées/courantes."""
    w = dz['semaine'].values
    lag = OPTIMAL_LAGS.get(zone, 6)
    
    exog_data = {
        'sin1': np.sin(2 * np.pi * w / 52.0),
        'cos1': np.cos(2 * np.pi * w / 52.0),
        'sin2': np.sin(4 * np.pi * w / 52.0),
        'cos2': np.cos(4 * np.pi * w / 52.0),
        'P_lag': dz['P'].shift(lag).fillna(0.0).values,
        'T_roll4': dz['T'].rolling(window=4, min_periods=1).mean().values,
        'trend_norm': (dz['t_global'].values / 52.0)
    }
    
    if include_delta:
        # Delta Y_{t-1} = Y_{t-1} - Y_{t-2} : STRICTEMENT DISPONIBLE À t-1
        # Pas de fuite : shift(1) et shift(2)
        delta_y = (dz['Y'].shift(1) - dz['Y'].shift(2)).fillna(0.0).values
        exog_data['delta_y_lag1'] = delta_y
        
    return pd.DataFrame(exog_data, index=dz.index)

def run_phase_h2_evaluation(df_raw: pd.DataFrame):
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
            
            # --- 0. Persistence ---
            last_y = y_train[-1] if len(y_train) > 0 else 0.0
            y_pred_pers = np.zeros(n_test)
            for i in range(n_test):
                y_pred_pers[i] = last_y
                last_y = y_test[i]
                
            # --- Étage 1 : Masque Hurdle ---
            clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
            clf.fit(dz_train[spline_cols].values, dz_train['y_binary'].values)
            y_prob_train = clf.predict_proba(dz_train[spline_cols].values)[:, 1]
            optimal_thresh = find_youden_index(dz_train['y_binary'].values, y_prob_train)
            mask_pred = (clf.predict_proba(dz_test[spline_cols].values)[:, 1] >= optimal_thresh).astype(int)
            
            # --- Modèle 1 : SARIMAX(1,0,0) (Réf Phase H) ---
            exog_train_1 = prepare_sarimax_exog(dz_train, zone, include_delta=False).values
            exog_test_1 = prepare_sarimax_exog(dz_test, zone, include_delta=False).values
            
            mod1 = SARIMAX(y_train, exog=exog_train_1, order=(1,0,0), trend='c', enforce_stationarity=True, enforce_invertibility=True)
            res1 = mod1.fit(disp=False, maxiter=200)
            ext1 = res1.append(y_test, exog=exog_test_1, refit=False)
            y_pred_m1 = mask_pred * np.maximum(0.0, ext1.fittedvalues[n_train:])
            
            # --- Modèle 2 : SARIMAX(2,0,0) ---
            mod2 = SARIMAX(y_train, exog=exog_train_1, order=(2,0,0), trend='c', enforce_stationarity=True, enforce_invertibility=True)
            res2 = mod2.fit(disp=False, maxiter=200)
            ext2 = res2.append(y_test, exog=exog_test_1, refit=False)
            y_pred_m2 = mask_pred * np.maximum(0.0, ext2.fittedvalues[n_train:])
            
            # --- Modèle 3 : SARIMAX(1,0,0) + Delta Y_{t-1} ---
            # Pour la variable Delta Y_{t-1}, concaténons train et test pour assurer la continuité aux frontières
            dz_full = pd.concat([dz_train, dz_test]).sort_values('t_global')
            exog_full_3 = prepare_sarimax_exog(dz_full, zone, include_delta=True).values
            exog_train_3 = exog_full_3[:n_train]
            exog_test_3 = exog_full_3[n_train:]
            
            mod3 = SARIMAX(y_train, exog=exog_train_3, order=(1,0,0), trend='c', enforce_stationarity=True, enforce_invertibility=True)
            res3 = mod3.fit(disp=False, maxiter=200)
            ext3 = res3.append(y_test, exog=exog_test_3, refit=False)
            y_pred_m3 = mask_pred * np.maximum(0.0, ext3.fittedvalues[n_train:])
            
            # Stockage
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
                    'pred_m1_ar1': y_pred_m1[i],
                    'pred_m2_ar2': y_pred_m2[i],
                    'pred_m3_delta': y_pred_m3[i]
                })
                
    df_preds = pd.DataFrame(all_records)
    
    # Détection des positions de pic (> 49.9 t)
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
    
    return df_preds

def compute_all_benchmarks(df_preds: pd.DataFrame):
    models = [
        ('Persistence', 'pred_pers'),
        ('Hurdle-SARIMAX(1,0,0)', 'pred_m1_ar1'),
        ('Hurdle-SARIMAX(2,0,0)', 'pred_m2_ar2'),
        ('Hurdle-SARIMAX(1)+DeltaY', 'pred_m3_delta')
    ]
    
    # 1. Global (1040 obs)
    glob_rows = []
    for name, col in models:
        m = calculate_metrics(df_preds['y_true'].values, df_preds[col].values)
        glob_rows.append({
            'Modèle': name,
            'MAE': m['MAE'],
            'RMSE': m['RMSE'],
            'Biais': m['Bias'],
            'MAPE (%)': m['MAPE']
        })
    df_global = pd.DataFrame(glob_rows)
    
    # 2. Conditionnel (Y > 0, 541 obs)
    df_act = df_preds[df_preds['is_active']].copy()
    cond_rows = []
    for name, col in models:
        m = calculate_metrics(df_act['y_true'].values, df_act[col].values)
        cond_rows.append({
            'Modèle': name,
            'MAE cond': m['MAE'],
            'RMSE cond': m['RMSE'],
            'Biais cond': m['Bias'],
            'MAPE cond (%)': m['MAPE']
        })
    df_cond = pd.DataFrame(cond_rows)
    
    # 3. Pics (> 49.9 t, 108/109 obs)
    df_pics = df_preds[df_preds['is_pic']].copy()
    pic_rows = []
    for name, col in models:
        m = calculate_metrics(df_pics['y_true'].values, df_pics[col].values)
        pic_rows.append({
            'Modèle': name,
            'N_obs': len(df_pics),
            'MAE pics': m['MAE'],
            'RMSE pics': m['RMSE'],
            'Biais pics': m['Bias']
        })
    df_pics_summary = pd.DataFrame(pic_rows)
    
    # 4. Épisodes de pics consécutifs (Semaine 1 / 2 / 3+)
    consec_rows = []
    for pos in ['Semaine 1 (Entrée)', 'Semaine 2 consécutive', 'Semaine 3+ consécutive']:
        sub_p = df_preds[df_preds['pic_position'] == pos]
        for name, col in models:
            m = calculate_metrics(sub_p['y_true'].values, sub_p[col].values)
            consec_rows.append({
                'Position Pic': pos,
                'N_obs': len(sub_p),
                'Modèle': name,
                'Y_true moyen': sub_p['y_true'].mean(),
                'Y_pred moyen': sub_p[col].mean(),
                'Biais (résidu)': m['Bias'],
                'MAE': m['MAE'],
                'RMSE': m['RMSE']
            })
    df_consec = pd.DataFrame(consec_rows)
    
    # 5. Déciles D9 et D10
    df_act['decile'] = pd.qcut(df_act['y_true'], q=10, labels=[f"D{i+1}" for i in range(10)])
    decile_rows = []
    for dec in ['D9', 'D10']:
        sub_d = df_act[df_act['decile'] == dec]
        for name, col in models:
            m = calculate_metrics(sub_d['y_true'].values, sub_d[col].values)
            decile_rows.append({
                'Décile': dec,
                'Y_min': sub_d['y_true'].min(),
                'Y_max': sub_d['y_true'].max(),
                'Y_true moyen': sub_d['y_true'].mean(),
                'Modèle': name,
                'Biais': m['Bias'],
                'MAE': m['MAE']
            })
    df_deciles = pd.DataFrame(decile_rows)
    
    # 6. Strates de volume (Faible, Moyen, Pics)
    df_act['strata'] = pd.cut(df_act['y_true'], bins=[0, 22.4, 49.9, 1e6], labels=['Faible (<=22.4)', 'Moyen (22.4-49.9)', 'Pics (>49.9)'])
    strata_rows = []
    for st in ['Faible (<=22.4)', 'Moyen (22.4-49.9)', 'Pics (>49.9)']:
        sub_s = df_act[df_act['strata'] == st]
        for name, col in models:
            m = calculate_metrics(sub_s['y_true'].values, sub_s[col].values)
            strata_rows.append({
                'Strate': st,
                'N_obs': len(sub_s),
                'Modèle': name,
                'Biais': m['Bias'],
                'MAE': m['MAE'],
                'RMSE': m['RMSE']
            })
    df_strata = pd.DataFrame(strata_rows)
    
    # 7. Par Zone
    zone_rows = []
    for z in sorted(df_preds['zone'].unique()):
        sub_z = df_preds[df_preds['zone'] == z]
        for name, col in models:
            m = calculate_metrics(sub_z['y_true'].values, sub_z[col].values)
            zone_rows.append({
                'Zone': z,
                'Modèle': name,
                'MAE': m['MAE'],
                'RMSE': m['RMSE'],
                'Biais': m['Bias']
            })
    df_zone = pd.DataFrame(zone_rows)
    
    # 8. Par Année
    year_rows = []
    for y in sorted(df_preds['fold'].unique()):
        sub_y = df_preds[df_preds['fold'] == y]
        for name, col in models:
            m = calculate_metrics(sub_y['y_true'].values, sub_y[col].values)
            year_rows.append({
                'Année': y,
                'Modèle': name,
                'MAE': m['MAE'],
                'RMSE': m['RMSE'],
                'Biais': m['Bias']
            })
    df_year = pd.DataFrame(year_rows)
    
    # 9. Autocorrélation des résidus et Ljung-Box
    acf_rows = []
    for name, col in models:
        # Résidus OOS sur observations actives
        res = df_act[col].values - df_act['y_true'].values
        acf_1 = float(pd.Series(res).autocorr(lag=1))
        acf_2 = float(pd.Series(res).autocorr(lag=2))
        acf_3 = float(pd.Series(res).autocorr(lag=3))
        
        lb_res = acorr_ljungbox(res, lags=[1, 2], return_df=True)
        lb_p1 = lb_res.loc[1, 'lb_pvalue']
        lb_p2 = lb_res.loc[2, 'lb_pvalue']
        
        corr_y = float(np.corrcoef(res, df_act['y_true'].values)[0, 1])
        
        acf_rows.append({
            'Modèle': name,
            'ACF(1)': acf_1,
            'ACF(2)': acf_2,
            'ACF(3)': acf_3,
            'Ljung-Box p-val (Lag 1)': lb_p1,
            'Ljung-Box p-val (Lag 2)': lb_p2,
            'Corr(résidu, Y_true)': corr_y
        })
    df_acf = pd.DataFrame(acf_rows)
    
    return df_global, df_cond, df_pics_summary, df_consec, df_deciles, df_strata, df_zone, df_year, df_acf

if __name__ == '__main__':
    print("=" * 80)
    print("  SM10 Agro — Évaluation Walk-Forward Phase H.2 (AR1 vs AR2 vs DeltaY)")
    print("=" * 80)
    
    raw_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
    df_raw = pd.read_csv(raw_path)
    
    df_preds = run_phase_h2_evaluation(df_raw)
    
    df_global, df_cond, df_pics, df_consec, df_deciles, df_strata, df_zone, df_year, df_acf = compute_all_benchmarks(df_preds)
    
    res_dir = os.path.join(base_dir, 'results')
    os.makedirs(res_dir, exist_ok=True)
    
    df_preds.to_csv(os.path.join(res_dir, 'sarimax_h2_oos_predictions.csv'), index=False)
    df_global.to_csv(os.path.join(res_dir, 'benchmark_global_phase_h2.csv'), index=False)
    df_cond.to_csv(os.path.join(res_dir, 'benchmark_conditionnel_phase_h2.csv'), index=False)
    df_pics.to_csv(os.path.join(res_dir, 'benchmark_pics_phase_h2.csv'), index=False)
    df_consec.to_csv(os.path.join(res_dir, 'benchmark_pics_consecutifs_h2.csv'), index=False)
    df_deciles.to_csv(os.path.join(res_dir, 'benchmark_deciles_h2.csv'), index=False)
    df_strata.to_csv(os.path.join(res_dir, 'benchmark_strates_phase_h2.csv'), index=False)
    df_zone.to_csv(os.path.join(res_dir, 'benchmark_par_zone_phase_h2.csv'), index=False)
    df_year.to_csv(os.path.join(res_dir, 'benchmark_par_annee_phase_h2.csv'), index=False)
    df_acf.to_csv(os.path.join(res_dir, 'benchmark_acf_ljungbox_h2.csv'), index=False)
    
    print("\n--- 1. BENCHMARK GLOBAL (POOLED 1040 OBS) ---")
    print(df_global.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 2. BENCHMARK CONDITIONNEL (Y > 0, 541 OBS) ---")
    print(df_cond.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 3. PICS GLOBAUX (> 49.9 t, 109 OBS) ---")
    print(df_pics.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 4. PICS CONSÉCUTIFS (SEMAINES 1, 2, 3+) ---")
    print(df_consec.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 5. DÉCILES D9 ET D10 ---")
    print(df_deciles.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n--- 6. ACF ET LJUNG-BOX DES RÉSIDUS ---")
    print(df_acf.to_string(index=False, float_format="{:7.3f}".format))
    
    print("\n[OK] Tous les résultats de la Phase H.2 ont été générés et enregistrés.")
