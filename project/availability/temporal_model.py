import pandas as pd
import numpy as np

def generate_temporal_availability(df: pd.DataFrame, n_days: int = 10, seed: int = 42):
    """
    Génère la disponibilité temporelle Q_it = Q_total_i * f_i(t)
    avec sum_t f_i(t) = 1.
    """
    np.random.seed(seed)
    n = len(df)
    
    Q_total = df['V_i'].values # V_i = P_i * TR_i
    
    # Génération de f_i(t) via une distribution de Dirichlet pour garantir la somme à 1
    # On simule que chaque producteur a une disponibilité étalée sur n_days jours
    # alpha=1.0 donne une distribution uniforme sur le simplexe
    f_it = np.random.dirichlet(np.ones(n_days), size=n)
    
    Q_it = Q_total[:, None] * f_it
    
    # Vérification stricte
    if not np.allclose(Q_it.sum(axis=1), Q_total):
        raise ValueError("Erreur : Somme temporelle != Q_total")
        
    return Q_it
