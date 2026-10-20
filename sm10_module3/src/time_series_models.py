"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : time_series_models.py

Modélisation temporelle avancée (Phase H : SARIMAX).
Intègre la dépendance temporelle autorégressive AR(p) et les régresseurs exogènes :
- Harmoniques de Fourier (saisonnalité annuelle parcimonieuse s=52)
- Pluie retardée causale P_{t - l^*}
- Température lissée T_{roll4}
- Tendance temporelle normalisée

Génère des prévisions 1-step-ahead rolling sans fuite d'information.
=============================================================================
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import statsmodels.api as sm
from statsmodels.tsa.statespace.sarimax import SARIMAX, SARIMAXResultsWrapper
from src.features import OPTIMAL_LAGS

class SARIMAXForecaster:
    """
    Modèle SARIMAX parcimonieux pour séries temporelles avec régresseurs exogènes.
    Spécification par défaut :
    - Ordre ARMA : (1, 0, 0) -> régression avec résidus autorégressifs AR(1)
    - Constante : incluse
    - Exogènes : Harmoniques de Fourier (2 ordres = 4 composantes), Pluie retardée, Température lissée, Tendance
    - Échelle : Y brute (pas de log, évite le shrinkage sur les pics et compatible avec les zéros hors-saison)
    """
    def __init__(
        self,
        order: Tuple[int, int, int] = (1, 0, 0),
        use_fourier: bool = True,
        use_meteo: bool = True,
        use_trend: bool = True,
        name: str = "SARIMAX(1,0,0)+Exog"
    ):
        self.order = order
        self.use_fourier = use_fourier
        self.use_meteo = use_meteo
        self.use_trend = use_trend
        self.name = name
        
        self.models_by_zone: Dict[str, SARIMAXResultsWrapper] = {}
        self.exog_cols: List[str] = []
        self.train_history_by_zone: Dict[str, pd.DataFrame] = {}
        self.fit_metadata: Dict[str, dict] = {}

    def _prepare_exog(self, df: pd.DataFrame, zone: str) -> pd.DataFrame:
        """Construit la matrice des variables exogènes parcimonieuses."""
        dz = df[df['zone'] == zone].sort_values('t_global').copy()
        exog_dict = {}
        
        # 1. Harmoniques de Fourier pour la saisonnalité annuelle (s = 52)
        if self.use_fourier:
            w = dz['semaine'].values
            exog_dict['sin1'] = np.sin(2 * np.pi * w / 52.0)
            exog_dict['cos1'] = np.cos(2 * np.pi * w / 52.0)
            exog_dict['sin2'] = np.sin(4 * np.pi * w / 52.0)
            exog_dict['cos2'] = np.cos(4 * np.pi * w / 52.0)
            
        # 2. Variables météorologiques
        if self.use_meteo:
            lag = OPTIMAL_LAGS.get(zone, 6)
            exog_dict['P_lag'] = dz['P'].shift(lag).fillna(0.0).values
            exog_dict['T_roll4'] = dz['T'].rolling(window=4, min_periods=1).mean().values
            
        # 3. Tendance normalisée (t_global / 52)
        if self.use_trend:
            exog_dict['trend_norm'] = (dz['t_global'].values / 52.0)
            
        exog_df = pd.DataFrame(exog_dict, index=dz.index)
        self.exog_cols = list(exog_df.columns)
        return exog_df

    def fit(self, df_train: pd.DataFrame, zone: str):
        """
        Ajuste le modèle SARIMAX sur la série temporelle continue d'entraînement.
        Aucune donnée de test n'est utilisée.
        """
        dz_train = df_train[df_train['zone'] == zone].sort_values('t_global').copy()
        self.train_history_by_zone[zone] = dz_train
        
        y_train = dz_train['Y'].values.astype(float)
        exog_df = self._prepare_exog(df_train, zone)
        X_train = exog_df.values if len(exog_df.columns) > 0 else None
        
        model = SARIMAX(
            endog=y_train,
            exog=X_train,
            order=self.order,
            trend='c',
            enforce_stationarity=True,
            enforce_invertibility=True
        )
        
        # Ajustement par Maximum de Vraisemblance (MLE)
        res = model.fit(disp=False, maxiter=200)
        self.models_by_zone[zone] = res
        
        # Sauvegarde des métadonnées
        self.fit_metadata[zone] = {
            'aic': float(res.aic),
            'bic': float(res.bic),
            'ar_params': res.arparams.tolist() if len(res.arparams) > 0 else [],
            'params': res.params.tolist()
        }

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        """
        Génère les prévisions 1-step-ahead rolling sur df_test.
        Utilise le filtre de Kalman via res.append(refit=False) pour mettre à jour
        les états temporels au fur et à mesure que Y_{t-1} devient disponible,
        avec les paramètres figés sur le train (zéro fuite).
        """
        res_train = self.models_by_zone.get(zone)
        if res_train is None:
            return np.zeros(len(df_test[df_test['zone'] == zone]))
            
        dz_test = df_test[df_test['zone'] == zone].sort_values('t_global').copy()
        n_test = len(dz_test)
        
        y_test = dz_test['Y'].values.astype(float)
        exog_test_df = self._prepare_exog(df_test, zone)
        X_test = exog_test_df.values if len(exog_test_df.columns) > 0 else None
        
        n_train = len(self.train_history_by_zone[zone])
        
        # Extension de l'état sans réajustement des paramètres (refit=False)
        res_extended = res_train.append(y_test, exog=X_test, refit=False)
        
        # Extraction stricte des prévisions 1-step-ahead sur la portion test
        preds = res_extended.fittedvalues[n_train:]
        
        # Garantie de non-négativité physique
        return np.maximum(0.0, preds)
