"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : regression_models.py

Implémentation de l'Étage 2 du modèle Hurdle.
Modèles de régression statiques : Ridge et Random Forest.
Intègre nativement la correction non paramétrique de Duan (smearing estimator)
calculée strictement sur les résidus du jeu d'entraînement.
=============================================================================
"""

import numpy as np
import pandas as pd
from typing import Dict, Optional
from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

class HurdleStage2Base:
    """Classe de base pour l'Étage 2 conditionnel (Y > 0) avec smearing de Duan."""
    def __init__(self, name: str, use_duan: bool = True):
        self.name = name
        self.use_duan = use_duan
        self.models_by_zone: Dict[str, Pipeline] = {}
        self.duan_factors_by_zone: Dict[str, float] = {}
        self.train_residuals_by_zone: Dict[str, np.ndarray] = {}
        self.train_sigma2_by_zone: Dict[str, float] = {}

    def _get_feature_cols(self, df: pd.DataFrame):
        # Splines + Météo (P retardée, T lissée) + Tendance
        splines = [c for c in df.columns if c.startswith('bs(')]
        return splines + ['P_lag', 'T_roll4', 't_global']

    def fit(self, df_train: pd.DataFrame, zone: str):
        """
        Entraîne le modèle sur les semaines actives (Y > 0) d'une zone donnée.
        Calcule et mémorise le facteur de smearing de Duan strictement sur le train.
        """
        dz_train = df_train[(df_train['zone'] == zone) & (df_train['Y'] > 0)]
        if len(dz_train) < 5:
            self.models_by_zone[zone] = None
            self.duan_factors_by_zone[zone] = 1.0
            return

        features = self._get_feature_cols(dz_train)
        X_train = dz_train[features].values
        
        # 1. Passage au log (générateur multiplicatif)
        y_train_log = np.log(dz_train['Y'].values)
        
        # 2. Ajustement du modèle
        model = self._create_model()
        model.fit(X_train, y_train_log)
        self.models_by_zone[zone] = model
        
        # 3. Calcul des résidus d'entraînement stricts : e_i = log(Y_i) - log(Y_hat_i)
        y_train_pred_log = model.predict(X_train)
        residuals_log = y_train_log - y_train_pred_log
        self.train_residuals_by_zone[zone] = residuals_log
        self.train_sigma2_by_zone[zone] = float(np.var(residuals_log, ddof=1))
        
        # 4. Facteur de smearing non paramétrique de Duan : S_Duan = mean(exp(e_i))
        # Calculé STRICTEMENT sur le jeu d'entraînement (aucune fuite temporelle)
        duan_factor = float(np.mean(np.exp(residuals_log)))
        self.duan_factors_by_zone[zone] = duan_factor

    def predict(self, df_test: pd.DataFrame, zone: str, apply_duan: Optional[bool] = None) -> np.ndarray:
        """
        Génère les prédictions sur df_test.
        Si apply_duan est True (ou par défaut selon self.use_duan), applique la correction de Duan.
        Garantit des prédictions strictement positives ou nulles.
        """
        dz_test = df_test[df_test['zone'] == zone]
        n = len(dz_test)
        
        model = self.models_by_zone.get(zone)
        if model is None:
            return np.zeros(n)
            
        features = self._get_feature_cols(dz_test)
        X_test = dz_test[features].values
        preds_log = model.predict(X_test)
        
        # Retransformation naïve
        preds_naive = np.exp(preds_log)
        
        # Application du facteur de smearing
        should_apply_duan = self.use_duan if apply_duan is None else apply_duan
        if should_apply_duan:
            factor = self.duan_factors_by_zone.get(zone, 1.0)
            preds = preds_naive * factor
        else:
            preds = preds_naive
            
        # Garantie de non-négativité
        return np.maximum(0.0, preds)

    def predict_naive(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        """Prédiction naïve sans correction de retransformation : exp(z)."""
        return self.predict(df_test, zone, apply_duan=False)

    def predict_duan(self, df_test: pd.DataFrame, zone: str) -> np.ndarray:
        """Prédiction avec smearing de Duan : exp(z) * S_Duan."""
        return self.predict(df_test, zone, apply_duan=True)

    def _create_model(self):
        raise NotImplementedError

class HurdleStage2Ridge(HurdleStage2Base):
    """
    Modèle Ridge pour l'Étage 2 avec StandardScaler.
    Supporte l'activation ou la désactivation de la correction de Duan.
    """
    def __init__(self, alpha: float = 1.0, use_duan: bool = True):
        name = "Hurdle-Ridge + Duan" if use_duan else "Hurdle-Ridge naïf"
        super().__init__(name=name, use_duan=use_duan)
        self.alpha = alpha

    def _create_model(self):
        return Pipeline([
            ('scaler', StandardScaler()),
            ('ridge', Ridge(alpha=self.alpha))
        ])

class HurdleStage2RF(HurdleStage2Base):
    """
    Random Forest contraint pour l'Étage 2.
    Profondeur et feuilles restreintes pour éviter le surapprentissage sur n~20-80.
    """
    def __init__(self, use_duan: bool = False, random_state: int = 42):
        name = "Hurdle-Random Forest" + (" + Duan" if use_duan else "")
        super().__init__(name=name, use_duan=use_duan)
        self.random_state = random_state

    def _create_model(self):
        return RandomForestRegressor(
            n_estimators=200,
            max_depth=4,
            min_samples_leaf=4,
            random_state=self.random_state
        )
