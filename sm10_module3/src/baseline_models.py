"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : baseline_models.py

Modèles de référence (Niveau 0).
Gèrent les zéros structurels nativement (sans modèle hurdle).
L'interface unifiée `fit(X, y)` / `predict(X)` permet l'intégration 
directe dans l'évaluateur walk-forward.
=============================================================================
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

class BaselineModel:
    """Classe de base pour les modèles de référence."""
    def __init__(self, name: str):
        self.name = name

    def fit(self, df_train: pd.DataFrame, zone: str):
        pass

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        raise NotImplementedError

class NaivePersistence(BaselineModel):
    """M0a : Y_hat_t = Y_{t-1}"""
    def __init__(self):
        super().__init__("M0a: Persistance")
        self.last_y_by_zone = {}

    def fit(self, df_train: pd.DataFrame, zone: str):
        dz_train = df_train[df_train['zone'] == zone].sort_values('t_global')
        if not dz_train.empty:
            self.last_y_by_zone[zone] = dz_train['Y'].iloc[-1]
        else:
            self.last_y_by_zone[zone] = 0.0

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        dz_test = df_test[df_test['zone'] == zone].sort_values('t_global')
        n = len(dz_test)
        preds = np.zeros(n)
        
        last_y = self.last_y_by_zone.get(zone, 0.0)
        for i in range(n):
            preds[i] = last_y
            # Y_t devient Y_{t-1} pour la prochaine étape
            last_y = dz_test['Y'].iloc[i] 
            
        return preds

class SeasonalNaive(BaselineModel):
    """M0b : Y_hat_t = Y_{t-52}"""
    def __init__(self):
        super().__init__("M0b: Naif Saisonnier")
        self.history_by_zone = {}

    def fit(self, df_train: pd.DataFrame, zone: str):
        dz_train = df_train[df_train['zone'] == zone].sort_values('t_global')
        # On garde l'historique complet pour pouvoir reculer de 52 semaines
        self.history_by_zone[zone] = dict(zip(dz_train['t_global'], dz_train['Y']))

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        dz_test = df_test[df_test['zone'] == zone].sort_values('t_global')
        n = len(dz_test)
        preds = np.zeros(n)
        
        history = self.history_by_zone.get(zone, {}).copy()
        
        for i, row in enumerate(dz_test.itertuples()):
            t = row.t_global
            t_minus_52 = t - 52
            
            # Cherche Y_{t-52} dans l'historique (train ou test passé)
            preds[i] = history.get(t_minus_52, 0.0)
            
            # Ajoute l'observation courante à l'historique pour les prédictions futures
            history[t] = row.Y
            
        return preds

class MovingAverage(BaselineModel):
    """M0c : Y_hat_t = (1/k) * sum(Y_{t-i}) pour i=1..k"""
    def __init__(self, k: int = 4):
        super().__init__(f"M0c: Moyenne Mobile (k={k})")
        self.k = k
        self.history_by_zone = {}

    def fit(self, df_train: pd.DataFrame, zone: str):
        dz_train = df_train[df_train['zone'] == zone].sort_values('t_global')
        if not dz_train.empty:
            self.history_by_zone[zone] = dz_train['Y'].values[-self.k:].tolist()
        else:
            self.history_by_zone[zone] = [0.0] * self.k

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        dz_test = df_test[df_test['zone'] == zone].sort_values('t_global')
        n = len(dz_test)
        preds = np.zeros(n)
        
        window = self.history_by_zone.get(zone, [0.0]*self.k).copy()
        
        for i in range(n):
            preds[i] = np.mean(window) if window else 0.0
            
            # Mise à jour de la fenêtre glissante
            window.append(dz_test['Y'].iloc[i])
            if len(window) > self.k:
                window.pop(0)
                
        return preds

class LinearTrend(BaselineModel):
    """M0d : Y_hat_t = b0 + b1*t"""
    def __init__(self):
        super().__init__("M0d: Tendance Lineaire")
        self.models_by_zone = {}

    def fit(self, df_train: pd.DataFrame, zone: str):
        dz_train = df_train[df_train['zone'] == zone].sort_values('t_global')
        if not dz_train.empty:
            X = dz_train[['t_global']].values
            y = dz_train['Y'].values
            
            lr = LinearRegression()
            lr.fit(X, y)
            self.models_by_zone[zone] = lr
        else:
            self.models_by_zone[zone] = None

    def predict(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        dz_test = df_test[df_test['zone'] == zone].sort_values('t_global')
        n = len(dz_test)
        
        lr = self.models_by_zone.get(zone)
        if lr is not None:
            X = dz_test[['t_global']].values
            preds = lr.predict(X)
            # Clip at 0 (pas de volumes négatifs)
            return np.maximum(0, preds)
        else:
            return np.zeros(n)
