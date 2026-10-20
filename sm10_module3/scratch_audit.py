import os
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from src.features import engineer_features
from src.hurdle_stage1_eval import find_youden_index
from src.evaluation import calculate_metrics

df = pd.read_csv('data/raw/simulated_harvest_data.csv')
df = engineer_features(df)
df['y_binary'] = (df['Y'] > 0).astype(int)
spline_cols = [c for c in df.columns if c.startswith('bs(')]
feature_cols = spline_cols + ['P_lag', 'T_roll4', 't_global']

years = sorted(df['annee'].unique())

records = []
all_residuals_log = []

for test_idx in range(1, len(years)):
    train_years = years[:test_idx]
    test_year = years[test_idx]
    
    df_train = df[df['annee'].isin(train_years)]
    df_test = df[df['annee'] == test_year]
    
    for zone in df['zone'].unique():
        dz_train = df_train[df_train['zone'] == zone].copy()
        dz_test = df_test[df_test['zone'] == zone].copy()
        
        # 1. Stage 1 (Classifier)
        clf = LogisticRegression(max_iter=1000, class_weight='balanced')
        clf.fit(dz_train[spline_cols].values, dz_train['y_binary'].values)
        y_prob_train = clf.predict_proba(dz_train[spline_cols].values)[:, 1]
        thresh = find_youden_index(dz_train['y_binary'].values, y_prob_train)
        
        prob_test = clf.predict_proba(dz_test[spline_cols].values)[:, 1]
        mask_pred = (prob_test >= thresh).astype(int)
        
        # 2. Stage 2 Data (Y > 0)
        dz_train_act = dz_train[dz_train['Y'] > 0]
        X_train_act = dz_train_act[feature_cols].values
        y_train_act_log = np.log(dz_train_act['Y'].values)
        
        # Ridge model
        ridge = Pipeline([('scaler', StandardScaler()), ('ridge', Ridge(alpha=1.0))])
        ridge.fit(X_train_act, y_train_act_log)
        
        # Train fitted values & residuals in log-space
        y_train_pred_log = ridge.predict(X_train_act)
        res_log = y_train_act_log - y_train_pred_log
        all_residuals_log.extend(res_log)
        
        # Corrections
        sigma2 = np.var(res_log, ddof=1)
        # Duan's smearing factor
        duan_factor = np.mean(np.exp(res_log))
        gauss_factor = np.exp(sigma2 / 2.0)
        
        # Test predictions
        X_test = dz_test[feature_cols].values
        pred_test_log = ridge.predict(X_test)
        
        pred_naive = np.exp(pred_test_log)
        pred_duan = np.exp(pred_test_log) * duan_factor
        pred_gauss = np.exp(pred_test_log) * gauss_factor
        
        # Persistence prediction (Y_{t-1})
        # Note: persistence uses last available Y in train, then step-by-step
        last_y = dz_train['Y'].iloc[-1]
        pred_pers = np.zeros(len(dz_test))
        for i in range(len(dz_test)):
            pred_pers[i] = last_y
            last_y = dz_test['Y'].iloc[i]
            
        y_true = dz_test['Y'].values
        mask_act = (y_true > 0)
        
        for i in range(len(dz_test)):
            records.append({
                'fold': test_year,
                'zone': zone,
                't_global': dz_test['t_global'].iloc[i],
                'semaine': dz_test['semaine'].iloc[i],
                'y_true': y_true[i],
                'is_active': mask_act[i],
                'mask_pred': mask_pred[i],
                'pred_pers': pred_pers[i],
                'pred_naive_s2': pred_naive[i],
                'pred_duan_s2': pred_duan[i],
                'pred_gauss_s2': pred_gauss[i],
                'duan_factor': duan_factor,
                'sigma2': sigma2
            })

df_eval = pd.DataFrame(records)

# Let's inspect Duan factors
print("--- FACTEUR DE SMEARING DE DUAN PAR FOLD/ZONE ---")
print(df_eval.groupby(['fold'])[['duan_factor', 'sigma2']].mean())

# Combine Stage 1 and Stage 2
df_eval['pred_naive_comb'] = df_eval['mask_pred'] * df_eval['pred_naive_s2']
df_eval['pred_duan_comb'] = df_eval['mask_pred'] * df_eval['pred_duan_s2']
df_eval['pred_gauss_comb'] = df_eval['mask_pred'] * df_eval['pred_gauss_s2']

# 1. EVALUATION CONDITIONNELLE (Y_true > 0)
df_act = df_eval[df_eval['is_active']]

print("\n--- AUDIT F3 : EVALUATION CONDITIONNELLE (Y_true > 0) ---")
for name, col in [('Persistance', 'pred_pers'), 
                  ('Ridge Naif (exp)', 'pred_naive_s2'), 
                  ('Ridge Duan Smearing', 'pred_duan_s2'),
                  ('Ridge Gauss exp(s2/2)', 'pred_gauss_s2')]:
    mae = np.mean(np.abs(df_act['y_true'] - df_act[col]))
    rmse = np.sqrt(np.mean((df_act['y_true'] - df_act[col])**2))
    bias = np.mean(df_act[col] - df_act['y_true'])
    print(f"{name:25s} | MAE: {mae:6.3f} | RMSE: {rmse:6.3f} | Biais: {bias:+6.3f}")

# 2. EVALUATION GLOBALE (Toutes semaines confondues)
print("\n--- AUDIT F5 : EVALUATION GLOBALE COMBINEE ---")
for name, col in [('Persistance', 'pred_pers'), 
                  ('Hurdle-Ridge Naif', 'pred_naive_comb'), 
                  ('Hurdle-Ridge Duan', 'pred_duan_comb'),
                  ('Hurdle-Ridge Gauss', 'pred_gauss_comb')]:
    mae = np.mean(np.abs(df_eval['y_true'] - df_eval[col]))
    rmse = np.sqrt(np.mean((df_eval['y_true'] - df_eval[col])**2))
    bias = np.mean(df_eval[col] - df_eval['y_true'])
    print(f"{name:25s} | MAE: {mae:6.3f} | RMSE: {rmse:6.3f} | Biais: {bias:+6.3f}")

# 3. AUDIT F4 : ERREUR PAR STRATE DE VOLUME
print("\n--- AUDIT F4 : ERREURS PAR NIVEAU DE VOLUME (CONDITIONNEL Y>0) ---")
q50 = df_act['y_true'].median()
q80 = df_act['y_true'].quantile(0.80)
print(f"Seuils : Médiane={q50:.1f}, Q80={q80:.1f}")

df_act['strata'] = pd.cut(df_act['y_true'], 
                          bins=[0, q50, q80, 1000], 
                          labels=['Faible (<=Q50)', 'Moyen (Q50-Q80)', 'Gros volume (>Q80)'])

for strata, grp in df_act.groupby('strata'):
    print(f"\nStratum: {strata} (n={len(grp)}) :")
    for name, col in [('Persistance', 'pred_pers'), 
                      ('Ridge Naif', 'pred_naive_s2'), 
                      ('Ridge Duan', 'pred_duan_s2')]:
        mae = np.mean(np.abs(grp['y_true'] - grp[col]))
        rmse = np.sqrt(np.mean((grp['y_true'] - grp[col])**2))
        bias = np.mean(grp[col] - grp['y_true'])
        print(f"  {name:15s} | MAE: {mae:6.3f} | RMSE: {rmse:6.3f} | Biais: {bias:+6.3f}")

# 4. AUDIT F2 : RESIDUS EN LOG
res = np.array(all_residuals_log)
print("\n--- AUDIT F2 : DIAGNOSTIC DES RESIDUS EN LOG (TRAIN) ---")
print(f"Moyenne: {np.mean(res):.4f} (proche de 0)")
print(f"Variance: {np.var(res):.4f}")
print(f"Skewness: {stats.skew(res):.4f}")
print(f"Kurtosis: {stats.kurtosis(res):.4f}")
stat_sw, p_sw = stats.shapiro(res[:500])
print(f"Test Shapiro-Wilk (n=500): Stat={stat_sw:.4f}, p-value={p_sw:.4e}")
