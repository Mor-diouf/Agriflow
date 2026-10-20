import numpy as np
import pandas as pd
from scipy.stats import norm, lognorm, gamma, beta
from m2_producers.config import N_PRODUCERS, SIGMA, MARGINALS

def generate_producers(seed: int, n: int = N_PRODUCERS) -> pd.DataFrame:
    """
    Génère les données des producteurs via une Copule Gaussienne.
    """
    np.random.seed(seed)
    
    # 1. Vérification SDP de la matrice Sigma
    eigenvalues = np.linalg.eigvals(SIGMA)
    if np.any(eigenvalues < -1e-8):
        raise ValueError(f"Erreur fatale: La matrice Sigma n'est pas SDP. Valeurs propres: {eigenvalues}")
        
    # 2. Génération multivariée normale
    Z = np.random.multivariate_normal(mean=np.zeros(4), cov=SIGMA, size=n)
    
    # 3. Copule : passage en uniformes
    U = norm.cdf(Z)
    
    # 4. Marginales
    A_i = lognorm.ppf(U[:, 0], s=MARGINALS["A"]["sigma"], scale=np.exp(MARGINALS["A"]["mu"]))
    # scipy gamma.ppf : a = alpha, scale = 1/beta (cf. config où beta paramètre est inversé)
    scale_R = 1 / MARGINALS["R"]["beta"] if MARGINALS["R"]["beta"] > 0 else 0
    # En lisant config.py : MARGINALS["R"]["beta"] vaut 1/0.45. Donc scale_R = 0.45.
    R_i = gamma.ppf(U[:, 1], a=MARGINALS["R"]["alpha"], scale=scale_R)
    TR_i = beta.ppf(U[:, 2], a=MARGINALS["TR"]["alpha"], b=MARGINALS["TR"]["beta"])
    Rej_i = beta.ppf(U[:, 3], a=MARGINALS["Rej"]["alpha"], b=MARGINALS["Rej"]["beta"])
    
    # 5. Variables dérivées
    # R_pot = R_i * (1 + epsilon_i)
    # On ajoute un petit bruit blanc pour simuler la variation entre potentiel et réalisé
    epsilon_i = np.random.normal(0, 0.05, size=n) 
    R_pot = R_i * (1 + epsilon_i)
    
    P_i = A_i * R_pot
    V_i = TR_i * P_i
    
    # 6. Construction DataFrame
    df = pd.DataFrame({
        'ID': [f"P{str(i+1).zfill(3)}" for i in range(n)],
        'A_i': A_i,
        'R_i': R_i,
        'TR_i': TR_i,
        'Rej_i': Rej_i,
        'P_i': P_i,
        'V_i': V_i
    })
    
    return df
