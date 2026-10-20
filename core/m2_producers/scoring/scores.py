import pandas as pd
import numpy as np

def compute_logistic_score(df: pd.DataFrame, w_TR: float, w_d: float, w_P: float) -> pd.Series:
    """
    Calcule S^{log}_i = w_TR * TR_norm + w_d * d_norm + w_P * P_norm
    """
    # 1. Vérification de la somme des poids
    if not np.isclose(w_TR + w_d + w_P, 1.0):
        raise ValueError(f"La somme des poids doit valoir 1 (obtenu: {w_TR + w_d + w_P})")
        
    # 2. Normalisation de TR_i (plus grand est mieux)
    TR_min = df['TR_i'].min()
    TR_max = df['TR_i'].max()
    TR_norm = (df['TR_i'] - TR_min) / (TR_max - TR_min) if TR_max > TR_min else df['TR_i'] * 0
    
    # 3. Normalisation de P_i (plus grand est mieux)
    P_min = df['P_i'].min()
    P_max = df['P_i'].max()
    P_norm = (df['P_i'] - P_min) / (P_max - P_min) if P_max > P_min else df['P_i'] * 0
    
    # 4. Normalisation de d_i0 (plus petit est mieux)
    # Vérification que d_i0 existe
    if 'd_i0' not in df.columns:
        raise ValueError("La colonne 'd_i0' est manquante. Générez les distances d'abord.")
        
    d_min = df['d_i0'].min()
    d_max = df['d_i0'].max()
    d_norm = 1.0 - (df['d_i0'] - d_min) / (d_max - d_min) if d_max > d_min else df['d_i0'] * 0 + 1.0
    
    # 5. Calcul du score
    S_log = w_TR * TR_norm + w_d * d_norm + w_P * P_norm
    return S_log
