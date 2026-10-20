"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : features.py

Préparation des variables explicatives pour les modèles de régression.
Intègre le signal causal (Pluie retardée) et le lissage thermique.
=============================================================================
"""

import pandas as pd
import numpy as np
from patsy import dmatrix

# Lags optimaux identifiés lors de l'EDA (Phase D) sur les résidus STL
OPTIMAL_LAGS = {
    'Bignona': 7,
    'Oussouye': 8,
    'Ziguinchor': 2, # Note: valeur atypique liée à la robustesse STL, mais on garde la découverte EDA
    'Sédhiou': 5,
    'Kolda': 8
}

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Crée les features pour chaque zone :
    - Splines cubiques sur la semaine (profil de base)
    - P_lag : Précipitations retardées de l_star semaines
    - T_roll4 : Moyenne mobile de la température sur 4 semaines
    - Tendance : index temporel normalisé
    """
    df = df.copy().sort_values(['zone', 't_global'])
    
    # 1. Splines cubiques sur le numéro de semaine
    formula = "bs(semaine, knots=[15, 19, 40, 42], degree=3, include_intercept=False)"
    df_splines = dmatrix(formula, {"semaine": df['semaine'].values}, return_type='dataframe')
    df = pd.concat([df.reset_index(drop=True), df_splines.reset_index(drop=True)], axis=1)
    
    # 2. Features Météo par zone
    feature_dfs = []
    for zone in df['zone'].unique():
        dz = df[df['zone'] == zone].copy()
        
        # Température lissée (Moyenne mobile 4 semaines)
        dz['T_roll4'] = dz['T'].rolling(window=4, min_periods=1).mean()
        
        # Pluie retardée (lag optimal)
        l_star = OPTIMAL_LAGS.get(zone, 6) # 6 par défaut
        dz['P_lag'] = dz['P'].shift(l_star).fillna(0)
        
        feature_dfs.append(dz)
        
    df_final = pd.concat(feature_dfs).sort_values(['zone', 't_global'])
    
    return df_final
