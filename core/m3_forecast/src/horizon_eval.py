"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : horizon_eval.py

Protocole walk-forward de la Phase J : prévision à plusieurs semaines.

Pour chaque horizon h (1 à 8 semaines), la semaine t est prévue avec la seule
information disponible à l'origine t − h :
- récolte observée jusqu'à t − h (Y_{t-h} ou état du filtre de Kalman) ;
- pluie retardée P_{t - max(l*, h)} : le retard physiologique l* tant qu'il couvre h ;
- température lissée connue à l'origine, T_roll4_{t-h} (la Phase I utilisait celle
  de la semaine prévue, inconnue au moment de prévoir) ;
- calendrier (Fourier, tendance, profil saisonnier du masque hurdle), connu d'avance.

Modèles comparés, plis 2022 à 2025 :
1. Persistance Y_{t-h}
2. Climatologie : moyenne de la même semaine sur les saisons d'entraînement
3. Hurdle-SARIMAX(1,0,0)+Exog : prévision dynamique à h pas
4. Combinaison SARIMAX + climatologie (niveau central) : poids appris, pour
   chaque horizon, sur les plis précédents. Au-delà de 2 semaines, SARIMAX seul
   fait moins bien que la climatologie ; la combinaison fait mieux que les deux.
5. Hurdle-Quantile direct (q = 0,75 et 0,90) : un modèle par horizon
6. Les mêmes quantiles recalibrés (niveaux prudent et stress) : conformité
   séquentielle sur les plis précédents, qui ne fait qu'élargir. Les saisons
   diffèrent trop pour qu'un pli bien couvert justifie de resserrer le suivant.
=============================================================================
"""

import os
import sys
import warnings

import numpy as np
import pandas as pd
import statsmodels.api as sm
from sklearn.linear_model import LogisticRegression
from statsmodels.regression.quantile_regression import QuantReg
from statsmodels.tsa.statespace.sarimax import SARIMAX

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from src.evaluation import calculate_metrics
from src.features import OPTIMAL_LAGS, engineer_features
from src.hurdle_stage1_eval import find_youden_index

HORIZONS = range(1, 9)
QUANTILES = (0.75, 0.90)
# Plancher de l'échelle des écarts normalisés : évite qu'une semaine de 0,2 t pèse comme un pic
CONFORMAL_SCALE_FLOOR_T = 1.0
# Poids de SARIMAX testés dans la combinaison avec la climatologie ; 0,5 sans historique
BLEND_WEIGHTS = np.round(np.arange(0.0, 1.01, 0.1), 1)
DEFAULT_BLEND_WEIGHT = 0.5


def horizon_exog(dz: pd.DataFrame, zone: str, h: int) -> pd.DataFrame:
    """
    Variables exogènes connues à l'origine t − h, sur la série continue d'une zone
    (entraînement et test concaténés, pour que les retards franchissent la coupure).
    """
    w = dz['semaine'].values
    t_roll4 = dz['T'].rolling(window=4, min_periods=1).mean()
    return pd.DataFrame({
        'sin1': np.sin(2 * np.pi * w / 52.0),
        'cos1': np.cos(2 * np.pi * w / 52.0),
        'sin2': np.sin(4 * np.pi * w / 52.0),
        'cos2': np.cos(4 * np.pi * w / 52.0),
        'P_lag': dz['P'].shift(max(OPTIMAL_LAGS.get(zone, 6), h)).fillna(0.0).values,
        'T_known': t_roll4.shift(h).fillna(t_roll4.iloc[0]).values,
        'trend_norm': dz['t_global'].values / 52.0,
    }, index=dz.index)


def sarimax_h_step(y: np.ndarray, exog: np.ndarray, n_train: int, h: int, start_params=None):
    """
    Prévisions à h pas des semaines de test : paramètres estimés sur l'entraînement,
    puis, pour chaque cible t, prévision dynamique depuis l'origine t − h (le filtre ne
    voit les observations que jusqu'à l'origine).
    """
    model = SARIMAX(y[:n_train], exog=exog[:n_train], order=(1, 0, 0), trend='c',
                    enforce_stationarity=True, enforce_invertibility=True)
    res = model.fit(disp=False, maxiter=200, start_params=start_params)
    extended = res.append(y[n_train:], exog=exog[n_train:], refit=False)
    preds = np.array([
        extended.get_prediction(start=t - h + 1, end=t, dynamic=True).predicted_mean[-1]
        for t in range(n_train, len(y))
    ])
    return np.maximum(0.0, preds), res.params


def direct_quantiles(y: np.ndarray, X: np.ndarray, n_train: int) -> dict:
    """Régressions quantiles directes (un modèle par horizon), avec réarrangement monotone."""
    X_c = sm.add_constant(X, has_constant='add')
    raw = np.column_stack([
        np.maximum(0.0, QuantReg(y[:n_train], X_c[:n_train]).fit(q=q, max_iter=2500).predict(X_c[n_train:]))
        for q in QUANTILES
    ])
    ordered = np.sort(raw, axis=1)  # Chernozhukov et al. (2010) : pas de croisement
    return {q: ordered[:, i] for i, q in enumerate(QUANTILES)}


def conformal_shift(y: np.ndarray, q_pred: np.ndarray, level: float) -> float:
    """
    Écart normalisé à ajouter au quantile pour couvrir `level` des semaines :
    quantile empirique (correction d'échantillon fini) de (y − q̂) / max(q̂, plancher).
    """
    scores = (y - q_pred) / np.maximum(q_pred, CONFORMAL_SCALE_FLOOR_T)
    n = len(scores)
    if n == 0:
        return 0.0
    rank = min(1.0, np.ceil((n + 1) * level) / n)
    return float(np.quantile(scores, rank, method='higher'))


def combine_central(df_preds: pd.DataFrame) -> pd.DataFrame:
    """
    Prévision centrale : w × SARIMAX + (1 − w) × climatologie. Pour chaque pli et chaque horizon,
    w minimise l'erreur absolue sur les semaines de récolte des plis précédents ; le premier pli,
    sans historique, prend 0,5.
    """
    df = df_preds.copy()
    df['w_sarimax'] = DEFAULT_BLEND_WEIGHT
    for h in df['horizon'].unique():
        for fold in sorted(df['fold'].unique()):
            past = df[(df['horizon'] == h) & (df['fold'] < fold) & df['is_active']]
            if past.empty:
                continue
            errors = [np.mean(np.abs(past['y_true'] - (w * past['pred_sarimax'] + (1 - w) * past['pred_clim'])))
                      for w in BLEND_WEIGHTS]
            df.loc[(df['horizon'] == h) & (df['fold'] == fold), 'w_sarimax'] = BLEND_WEIGHTS[int(np.argmin(errors))]
    df['pred_central'] = df['w_sarimax'] * df['pred_sarimax'] + (1 - df['w_sarimax']) * df['pred_clim']
    return df


def recalibrate(df_preds: pd.DataFrame) -> pd.DataFrame:
    """
    Conformité séquentielle : pour chaque pli et chaque horizon, l'écart est appris sur
    les semaines de récolte des plis précédents (aucune information du pli évalué).
    Le premier pli, sans historique de calibration, reste brut. L'écart ne fait qu'élargir :
    resserrer après une saison bien couverte dégradait la couverture et la perte quantile.
    """
    df = df_preds.copy()
    for q in QUANTILES:
        raw_col, cal_col = f'pred_q{int(q * 100)}_raw', f'pred_q{int(q * 100)}'
        df[cal_col] = df[raw_col]
        for h in df['horizon'].unique():
            for fold in sorted(df['fold'].unique()):
                past = df[(df['horizon'] == h) & (df['fold'] < fold) & df['is_active'] & (df['mask_pred'] == 1)]
                if past.empty:
                    continue
                shift = max(0.0, conformal_shift(past['y_true'].values, past[raw_col].values, q))
                rows = (df['horizon'] == h) & (df['fold'] == fold) & (df['mask_pred'] == 1)
                scale = np.maximum(df.loc[rows, raw_col], CONFORMAL_SCALE_FLOOR_T)
                df.loc[rows, cal_col] = np.maximum(0.0, df.loc[rows, raw_col] + shift * scale)
    # Les deux niveaux recalibrés restent ordonnés
    ordered = np.sort(df[['pred_q75', 'pred_q90']].values, axis=1)
    df['pred_q75'], df['pred_q90'] = ordered[:, 0], ordered[:, 1]
    return df


def run_horizon_evaluation(df_raw: pd.DataFrame, horizons=HORIZONS) -> pd.DataFrame:
    """Prévisions hors échantillon de chaque horizon, une ligne par (pli, zone, semaine, horizon)."""
    warnings.filterwarnings('ignore')  # avertissements de convergence statsmodels sur les plis courts
    df_feat = engineer_features(df_raw)
    df_feat['y_binary'] = (df_feat['Y'] > 0).astype(int)
    spline_cols = [c for c in df_feat.columns if c.startswith('bs(')]
    years = sorted(df_raw['annee'].unique())
    records = []

    for test_year in years[1:]:
        for zone in sorted(df_raw['zone'].unique()):
            dz = df_feat[(df_feat['zone'] == zone) & (df_feat['annee'] <= test_year)].sort_values('t_global')
            dz = dz.reset_index(drop=True)
            n_train = int((dz['annee'] < test_year).sum())
            train, test = dz.iloc[:n_train], dz.iloc[n_train:]
            y = dz['Y'].values.astype(float)

            # Étage 1 hurdle : profil saisonnier (splines de la semaine), connu d'avance
            clf = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=42)
            clf.fit(train[spline_cols].values, train['y_binary'].values)
            threshold = find_youden_index(train['y_binary'].values, clf.predict_proba(train[spline_cols].values)[:, 1])
            mask = (clf.predict_proba(test[spline_cols].values)[:, 1] >= threshold).astype(int)

            climatology = train.groupby('semaine')['Y'].mean()
            pred_clim = test['semaine'].map(climatology).fillna(0.0).values

            params = None
            for h in horizons:
                exog = horizon_exog(dz, zone, h)
                pred_sarimax, params = sarimax_h_step(y, exog.values, n_train, h, start_params=params)
                X_q = np.column_stack([exog.values, dz['Y'].shift(h).fillna(0.0).values])
                quantiles = direct_quantiles(y, X_q, n_train)
                pred_pers = dz['Y'].shift(h).fillna(0.0).values[n_train:]

                for i in range(len(test)):
                    records.append({
                        'fold': test_year,
                        'zone': zone,
                        't_global': test['t_global'].iloc[i],
                        'semaine': test['semaine'].iloc[i],
                        'horizon': h,
                        'y_true': y[n_train + i],
                        'is_active': y[n_train + i] > 0,
                        'mask_pred': mask[i],
                        'pred_pers': pred_pers[i],
                        'pred_clim': pred_clim[i],
                        'pred_sarimax': mask[i] * pred_sarimax[i],
                        'pred_q75_raw': mask[i] * quantiles[0.75][i],
                        'pred_q90_raw': mask[i] * quantiles[0.90][i],
                    })
            print(f"  {test_year} · {zone} : horizons {min(horizons)} à {max(horizons)} évalués")

    return recalibrate(combine_central(pd.DataFrame(records)))


# Modèle → (colonne de prévision, niveau servi aux interfaces)
BENCHMARK_MODELS = [
    ('Persistence', 'pred_pers', None),
    ('Climatologie', 'pred_clim', None),
    ('Hurdle-SARIMAX(1,0,0)+Exog', 'pred_sarimax', None),
    ('Combinaison SARIMAX + climatologie', 'pred_central', 'central'),
    ('Hurdle-Quantile(0.75) brut', 'pred_q75_raw', None),
    ('Hurdle-Quantile(0.90) brut', 'pred_q90_raw', None),
    ('Hurdle-Quantile(0.75) recalibré', 'pred_q75', 'prudent'),
    ('Hurdle-Quantile(0.90) recalibré', 'pred_q90', 'stress'),
]


def compute_horizon_benchmark(df_preds: pd.DataFrame) -> pd.DataFrame:
    """Métriques de chaque modèle et horizon, sur toutes les semaines et sur les semaines de récolte."""
    rows = []
    for h, dh in df_preds.groupby('horizon'):
        for scope, ds in (('all_weeks', dh), ('harvest_weeks', dh[dh['is_active']])):
            y_true = ds['y_true'].values
            for model, col, level in BENCHMARK_MODELS:
                m = calculate_metrics(y_true, ds[col].values)
                rows.append({
                    'horizon': int(h), 'scope': scope, 'model': model, 'level': level, 'weeks': len(ds),
                    'mae': m['MAE'], 'rmse': m['RMSE'], 'bias': m['Bias'],
                    'coverage_pct': float(np.mean(y_true <= ds[col].values) * 100.0),
                })
    return pd.DataFrame(rows)


if __name__ == '__main__':
    data_path = os.path.join(base_dir, 'data', 'raw', 'simulated_harvest_data.csv')
    print(f"Chargement des données : {data_path}")
    df_preds = run_horizon_evaluation(pd.read_csv(data_path, encoding='utf-8'))

    res_dir = os.path.join(base_dir, 'results')
    df_preds.to_csv(os.path.join(res_dir, 'horizon_oos_predictions.csv'), index=False, encoding='utf-8')
    benchmark = compute_horizon_benchmark(df_preds)
    benchmark.to_csv(os.path.join(res_dir, 'benchmark_horizons_phase_j.csv'), index=False, encoding='utf-8')

    harvest = benchmark[benchmark['scope'] == 'harvest_weeks']
    print("\n=== ERREUR MOYENNE (t, semaines de récolte) PAR HORIZON ===")
    print(harvest.pivot(index='horizon', columns='model', values='mae').round(2).to_string())
    print("\n=== COUVERTURE (%, semaines de récolte) PAR HORIZON ===")
    quantile_models = [m for m, _, _ in BENCHMARK_MODELS if 'Quantile' in m]
    print(harvest[harvest['model'].isin(quantile_models)]
          .pivot(index='horizon', columns='model', values='coverage_pct').round(1).to_string())
