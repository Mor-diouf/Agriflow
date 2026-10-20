import os
import sys
import numpy as np
import pandas as pd
from scipy import stats

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from src.features import engineer_features, OPTIMAL_LAGS

# 1. Chargement des prédictions OOS officielles
preds_path = os.path.join(base_dir, 'results/sarimax_oos_predictions.csv')
df_preds = pd.read_csv(preds_path)

# 2. Chargement des données brutes avec features exogènes
raw_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
df_raw = pd.read_csv(raw_path)
df_feat = engineer_features(df_raw)

# Fusion pour avoir les exogènes P_lag, T_roll4, etc.
exog_cols_merge = ['zone', 't_global', 'P', 'T', 'P_lag', 'T_roll4']
df = pd.merge(df_preds, df_feat[exog_cols_merge], on=['zone', 't_global'], how='left')

# Calcul des résidus (Biais = Y_pred - Y_true)
df['res_sarimax'] = df['comb_sarimax'] - df['y_true']
df['res_pers'] = df['comb_pers'] - df['y_true']
df['res_ridge'] = df['comb_ridge_duan'] - df['y_true']

# Y_{t-1} disponible via comb_pers
df['y_lag1'] = df['comb_pers']

# Sous-ensembles
df_act = df[df['is_active']].copy() # Y_true > 0 (541 obs)
df_pics = df[df['y_true'] > 49.9].copy() # Pics (108 obs)

print("=" * 80)
print(f"DIAGNOSTIC H.1 : N_total={len(df)}, N_actifs={len(df_act)}, N_pics={len(df_pics)}")
print("=" * 80)

# -----------------------------------------------------------------------------
# 1. Résidus par semaine de l'année (semaines actives)
# -----------------------------------------------------------------------------
sem_grp = df_act.groupby('semaine').agg(
    n_obs=('y_true', 'count'),
    y_true_mean=('y_true', 'mean'),
    sarimax_pred_mean=('comb_sarimax', 'mean'),
    pers_pred_mean=('comb_pers', 'mean'),
    sarimax_bias=('res_sarimax', 'mean'),
    pers_bias=('res_pers', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x))),
    sarimax_rmse=('res_sarimax', lambda x: np.sqrt(np.mean(x**2)))
).reset_index()

# -----------------------------------------------------------------------------
# 2. Résidus par zone (sur les pics Y > 49.9 t et en conditionnel)
# -----------------------------------------------------------------------------
zone_pics = df_pics.groupby('zone').agg(
    n_pics=('y_true', 'count'),
    y_true_mean=('y_true', 'mean'),
    sarimax_mean=('comb_sarimax', 'mean'),
    pers_mean=('comb_pers', 'mean'),
    sarimax_bias=('res_sarimax', 'mean'),
    pers_bias=('res_pers', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x))),
    sarimax_rmse=('res_sarimax', lambda x: np.sqrt(np.mean(x**2)))
).reset_index()

# -----------------------------------------------------------------------------
# 3. Résidus par année sur les pics
# -----------------------------------------------------------------------------
year_pics = df_pics.groupby('fold').agg(
    n_pics=('y_true', 'count'),
    y_true_mean=('y_true', 'mean'),
    sarimax_mean=('comb_sarimax', 'mean'),
    pers_mean=('comb_pers', 'mean'),
    sarimax_bias=('res_sarimax', 'mean'),
    pers_bias=('res_pers', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x))),
    sarimax_rmse=('res_sarimax', lambda x: np.sqrt(np.mean(x**2)))
).reset_index()

# -----------------------------------------------------------------------------
# 4. Résidus selon les strates
# -----------------------------------------------------------------------------
df_act['strata'] = pd.cut(
    df_act['y_true'], 
    bins=[0, 22.4, 49.9, 1e6], 
    labels=['Faible (<=22.4)', 'Moyen (22.4-49.9)', 'Pics (>49.9)']
)
strata_summary = df_act.groupby('strata', observed=False).agg(
    n_obs=('y_true', 'count'),
    y_true_mean=('y_true', 'mean'),
    sarimax_bias=('res_sarimax', 'mean'),
    pers_bias=('res_pers', 'mean'),
    ridge_bias=('res_ridge', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x))),
    pers_mae=('res_pers', lambda x: np.mean(np.abs(x))),
    sarimax_rmse=('res_sarimax', lambda x: np.sqrt(np.mean(x**2))),
    pers_rmse=('res_pers', lambda x: np.sqrt(np.mean(x**2)))
).reset_index()

# -----------------------------------------------------------------------------
# 5. Résidus selon les déciles de Y_true
# -----------------------------------------------------------------------------
df_act['decile'] = pd.qcut(df_act['y_true'], q=10, labels=[f"D{i+1}" for i in range(10)])
decile_summary = df_act.groupby('decile', observed=False).agg(
    y_min=('y_true', 'min'),
    y_max=('y_true', 'max'),
    y_true_mean=('y_true', 'mean'),
    sarimax_bias=('res_sarimax', 'mean'),
    pers_bias=('res_pers', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x)))
).reset_index()

# -----------------------------------------------------------------------------
# 6. Résidus selon Y_{t-1}
# -----------------------------------------------------------------------------
# Corrélation entre résidu SARIMAX et Y_{t-1}
corr_res_ylag = df_act['res_sarimax'].corr(df_act['y_lag1'])
corr_res_ytrue = df_act['res_sarimax'].corr(df_act['y_true'])
corr_ylag_ytrue = df_act['y_lag1'].corr(df_act['y_true'])

# -----------------------------------------------------------------------------
# 7. Épisodes de pics consécutifs
# -----------------------------------------------------------------------------
# Détection de la position dans l'épisode de pic consécutif pour chaque zone/fold
df = df.sort_values(['zone', 't_global']).reset_index(drop=True)
df['is_pic'] = (df['y_true'] > 49.9)

pic_position = []
for zone in df['zone'].unique():
    dz = df[df['zone'] == zone].copy()
    current_pos = 0
    for idx, row in dz.iterrows():
        if row['is_pic']:
            current_pos += 1
            if current_pos == 1:
                pic_position.append('Semaine 1 (Entrée dans le pic)')
            elif current_pos == 2:
                pic_position.append('Semaine 2 consécutive')
            else:
                pic_position.append('Semaine 3+ consécutive')
        else:
            current_pos = 0
            pic_position.append('Hors pic')

df['pic_position'] = pic_position

consec_table = df[df['is_pic']].groupby('pic_position').agg(
    n_obs=('y_true', 'count'),
    y_true_mean=('y_true', 'mean'),
    sarimax_pred_mean=('comb_sarimax', 'mean'),
    pers_pred_mean=('comb_pers', 'mean'),
    sarimax_res_mean=('res_sarimax', 'mean'),
    pers_res_mean=('res_pers', 'mean'),
    sarimax_mae=('res_sarimax', lambda x: np.mean(np.abs(x))),
    pers_mae=('res_pers', lambda x: np.mean(np.abs(x))),
    sarimax_rmse=('res_sarimax', lambda x: np.sqrt(np.mean(x**2))),
    pers_rmse=('res_pers', lambda x: np.sqrt(np.mean(x**2)))
).reset_index()

# -----------------------------------------------------------------------------
# 8. Autocorrélation des résidus OOS
# -----------------------------------------------------------------------------
# Calcul de l'ACF des résidus par zone pour éviter les sauts entre zones
acf_by_zone = {}
for zone in df['zone'].unique():
    res_z = df[df['zone'] == zone]['res_sarimax'].values
    acf_vals = [pd.Series(res_z).autocorr(lag=l) for l in range(1, 11)]
    acf_by_zone[zone] = acf_vals

df_acf = pd.DataFrame(acf_by_zone, index=[f"Lag_{l}" for l in range(1, 11)])
df_acf['Moyenne'] = df_acf.mean(axis=1)

# Test de Ljung-Box sur résidus actifs
from statsmodels.stats.diagnostic import acorr_ljungbox
lb_test = acorr_ljungbox(df_act['res_sarimax'], lags=[1, 2, 5, 10], return_df=True)

# -----------------------------------------------------------------------------
# 9. Distribution des résidus
# -----------------------------------------------------------------------------
res_act = df_act['res_sarimax'].values
dist_stats = {
    'Moyenne': np.mean(res_act),
    'Écart-type': np.std(res_act, ddof=1),
    'Médiane': np.median(res_act),
    'Skewness': float(stats.skew(res_act)),
    'Kurtosis': float(stats.kurtosis(res_act)),
    'Shapiro-Wilk Stat': float(stats.shapiro(res_act[:500])[0]),
    'Shapiro-Wilk p-val': float(stats.shapiro(res_act[:500])[1])
}

# -----------------------------------------------------------------------------
# 10. Relation entre résidus et exogènes
# -----------------------------------------------------------------------------
corr_exog = {
    'Corr(res, P_lag)': df_act['res_sarimax'].corr(df_act['P_lag']),
    'Corr(res, T_roll4)': df_act['res_sarimax'].corr(df_act['T_roll4']),
    'Corr(res, semaine)': df_act['res_sarimax'].corr(df_act['semaine']),
    'Corr(res, Y_true)': df_act['res_sarimax'].corr(df_act['y_true'])
}

# Sauvegardes
res_dir = os.path.join(base_dir, 'results')
consec_table.to_csv(os.path.join(res_dir, 'diag_h1_pics_consecutifs.csv'), index=False)
zone_pics.to_csv(os.path.join(res_dir, 'diag_h1_residus_zone_pics.csv'), index=False)
sem_grp.to_csv(os.path.join(res_dir, 'diag_h1_residus_semaine.csv'), index=False)
decile_summary.to_csv(os.path.join(res_dir, 'diag_h1_residus_deciles.csv'), index=False)

print("\n--- 1. TABLEAU DES ÉPISODES DE PICS CONSÉCUTIFS (DEMANDÉ EXPLICITEMENT) ---")
print(consec_table.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 2. BIAIS ET MAE SUR LES PICS PAR ZONE ---")
print(zone_pics.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 3. BIAIS ET MAE SUR LES PICS PAR ANNEE ---")
print(year_pics.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 4. BIAIS PAR STRATE DE VOLUME ---")
print(strata_summary[['strata', 'n_obs', 'y_true_mean', 'sarimax_bias', 'pers_bias', 'ridge_bias']].to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 5. BIAIS SELON LES DÉCILES DE Y_TRUE ---")
print(decile_summary.to_string(index=False, float_format="{:7.3f}".format))

print("\n--- 6. AUTOCORRÉLATION DES RÉSIDUS OOS ---")
print(df_acf['Moyenne'].to_string(float_format="{:7.3f}".format))
print("\nTest Ljung-Box sur résidus OOS actifs :")
print(lb_test)

print("\n--- 7. STATISTIQUES DE DISTRIBUTION DES RÉSIDUS ---")
for k, v in dist_stats.items():
    print(f"  {k:20s}: {v:10.4f}")

print("\n--- 8. CORRÉLATIONS AVEC EXOGÈNES ---")
for k, v in corr_exog.items():
    print(f"  {k:20s}: {v:10.4f}")
