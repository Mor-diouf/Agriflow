import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

import pandas as pd
import numpy as np
from src.hurdle_pipeline_eval import run_hurdle_pipeline_evaluation
from src.evaluation import calculate_metrics

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
df = pd.read_csv(data_path)

# Exécution du walk-forward officiel
df_preds, df_global, df_cond, df_strata = run_hurdle_pipeline_evaluation(df)

models = [
    ('Persistence', 'comb_pers', 'cond_pers'),
    ('Hurdle-Ridge naïf', 'comb_ridge_naive', 'cond_ridge_naive'),
    ('Hurdle-Ridge + Duan', 'comb_ridge_duan', 'cond_ridge_duan'),
    ('Hurdle-Random Forest', 'comb_rf', 'cond_rf')
]

# -------------------------------------------------------------
# 1. Performance par zone (Global : toutes semaines)
# -------------------------------------------------------------
rows_zone = []
for zone in sorted(df_preds['zone'].unique()):
    sub = df_preds[df_preds['zone'] == zone]
    for name, comb_col, _ in models:
        mets = calculate_metrics(sub['y_true'].values, sub[comb_col].values)
        rows_zone.append({
            'Zone': zone,
            'Modèle': name,
            'MAE': mets['MAE'],
            'RMSE': mets['RMSE'],
            'Biais': mets['Bias'],
            'MAPE (%)': mets['MAPE']
        })
df_perf_zone = pd.DataFrame(rows_zone)

# -------------------------------------------------------------
# 2. Performance par année (Global : toutes semaines)
# -------------------------------------------------------------
rows_year = []
for year in sorted(df_preds['fold'].unique()):
    sub = df_preds[df_preds['fold'] == year]
    for name, comb_col, _ in models:
        mets = calculate_metrics(sub['y_true'].values, sub[comb_col].values)
        rows_year.append({
            'Année': year,
            'Modèle': name,
            'MAE': mets['MAE'],
            'RMSE': mets['RMSE'],
            'Biais': mets['Bias'],
            'MAPE (%)': mets['MAPE']
        })
df_perf_year = pd.DataFrame(rows_year)

# -------------------------------------------------------------
# 3. Performance conditionnelle par zone (Y_true > 0)
# -------------------------------------------------------------
df_active = df_preds[df_preds['is_active']].copy()
rows_cond_zone = []
for zone in sorted(df_active['zone'].unique()):
    sub = df_active[df_active['zone'] == zone]
    for name, _, cond_col in models:
        mets = calculate_metrics(sub['y_true'].values, sub[cond_col].values)
        rows_cond_zone.append({
            'Zone': zone,
            'N_obs_actives': len(sub),
            'Modèle': name,
            'MAE cond': mets['MAE'],
            'RMSE cond': mets['RMSE'],
            'Biais cond': mets['Bias'],
            'MAPE cond (%)': mets['MAPE']
        })
df_perf_cond_zone = pd.DataFrame(rows_cond_zone)

# -------------------------------------------------------------
# 4. Analyse des pics et contrôle d'absence de fuite temporelle
# -------------------------------------------------------------
# Option A : Seuils sur données de test globales (purement descriptif pour le rapport)
q50 = float(df_active['y_true'].median())
q80 = float(df_active['y_true'].quantile(0.80))

# Option B : Seuils dynamiques basés uniquement sur les quantiles d'entraînement
# Vérifions si les seuils dynamiques sans aucune fuite donnent la même structure
strata_records_dynamic = []
for test_year in sorted(df_preds['fold'].unique()):
    train_history = df[(df['annee'] < test_year) & (df['Y'] > 0)]
    q50_dyn = float(train_history['Y'].median())
    q80_dyn = float(train_history['Y'].quantile(0.80))
    
    sub_test = df_active[df_active['fold'] == test_year].copy()
    sub_test['strata_dyn'] = pd.cut(
        sub_test['y_true'], 
        bins=[0, q50_dyn, q80_dyn, 1e6], 
        labels=['Faible (<=Q50)', 'Moyen (Q50-Q80)', 'Gros/Pics (>Q80)']
    )
    for s_label in ['Faible (<=Q50)', 'Moyen (Q50-Q80)', 'Gros/Pics (>Q80)']:
        sub_s = sub_test[sub_test['strata_dyn'] == s_label]
        for name, _, cond_col in models:
            if len(sub_s) > 0:
                mets = calculate_metrics(sub_s['y_true'].values, sub_s[cond_col].values)
                strata_records_dynamic.append({
                    'Fold': test_year,
                    'Strate': s_label,
                    'N_obs': len(sub_s),
                    'Modèle': name,
                    'MAE': mets['MAE'],
                    'RMSE': mets['RMSE'],
                    'Biais': mets['Bias']
                })
df_strata_dyn = pd.DataFrame(strata_records_dynamic)
df_strata_dyn_agg = df_strata_dyn.groupby(['Strate', 'Modèle'])[['MAE', 'RMSE', 'Biais']].mean().reset_index()

# -------------------------------------------------------------
# 5. Comparaison explicite Duan vs Naïf
# -------------------------------------------------------------
# Global
m_naive = df_global[df_global['Modèle'] == 'Hurdle-Ridge naïf'].iloc[0]
m_duan = df_global[df_global['Modèle'] == 'Hurdle-Ridge + Duan'].iloc[0]

delta_global = {
    'Contexte': 'Global (Toutes semaines)',
    'Delta_MAE': m_duan['MAE'] - m_naive['MAE'],
    'Delta_RMSE': m_duan['RMSE'] - m_naive['RMSE'],
    'Delta_Biais': m_duan['Biais'] - m_naive['Biais'],
    'Delta_MAPE (%)': m_duan['MAPE (%)'] - m_naive['MAPE (%)']
}

# Conditionnel (Y > 0)
mc_naive = df_cond[df_cond['Modèle'] == 'Hurdle-Ridge naïf'].iloc[0]
mc_duan = df_cond[df_cond['Modèle'] == 'Hurdle-Ridge + Duan'].iloc[0]

delta_cond = {
    'Contexte': 'Conditionnel (Y > 0)',
    'Delta_MAE': mc_duan['MAE conditionnel'] - mc_naive['MAE conditionnel'],
    'Delta_RMSE': mc_duan['RMSE conditionnel'] - mc_naive['RMSE conditionnel'],
    'Delta_Biais': mc_duan['Biais conditionnel'] - mc_naive['Biais conditionnel'],
    'Delta_MAPE (%)': mc_duan['MAPE conditionnel (%)'] - mc_naive['MAPE conditionnel (%)']
}

# Par strates
delta_strata = []
for st in df_strata['Strate'].unique():
    sub_st = df_strata[df_strata['Strate'] == st]
    s_naive = sub_st[sub_st['Modèle'] == 'Hurdle-Ridge naïf'].iloc[0]
    s_duan = sub_st[sub_st['Modèle'] == 'Hurdle-Ridge + Duan'].iloc[0]
    delta_strata.append({
        'Contexte': f"Strate : {st}",
        'Delta_MAE': s_duan['MAE'] - s_naive['MAE'],
        'Delta_RMSE': s_duan['RMSE'] - s_naive['RMSE'],
        'Delta_Biais': s_duan['Biais'] - s_naive['Biais'],
        'Delta_MAPE (%)': np.nan
    })

df_deltas = pd.DataFrame([delta_global, delta_cond] + delta_strata)

# Sauvegarde de tous les résultats diagnostiques
res_dir = os.path.join(base_dir, 'results')
df_perf_zone.to_csv(os.path.join(res_dir, 'diag_perf_par_zone.csv'), index=False)
df_perf_year.to_csv(os.path.join(res_dir, 'diag_perf_par_annee.csv'), index=False)
df_perf_cond_zone.to_csv(os.path.join(res_dir, 'diag_perf_cond_par_zone.csv'), index=False)
df_deltas.to_csv(os.path.join(res_dir, 'diag_deltas_duan_vs_naif.csv'), index=False)
df_strata_dyn_agg.to_csv(os.path.join(res_dir, 'diag_strates_dynamiques_sans_fuite.csv'), index=False)

print("\n--- 1. PERFORMANCE PAR ZONE (GLOBAL) ---")
print(df_perf_zone.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 2. PERFORMANCE PAR ANNEE (GLOBAL) ---")
print(df_perf_year.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 3. PERFORMANCE CONDITIONNELLE PAR ZONE (Y > 0) ---")
print(df_perf_cond_zone.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 4. COMPARAISON EXPLICITE DUAN VS NAIF ---")
print(df_deltas.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 5. STRATES AVEC SEUILS DYNAMIQUES STRICTEMENT SUR TRAIN (AUCUNE FUITE) ---")
print(df_strata_dyn_agg.to_string(index=False, float_format="{:7.3f}".format))
