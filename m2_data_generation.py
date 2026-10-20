import numpy as np
import pandas as pd
from scipy.stats import norm, lognorm, gamma, beta
import os

def generate_dataset(N=100, seed=42):
    np.random.seed(seed)
    
    # 1. Matrice de corrélation latente (Sigma)
    # A_i, R_i, TR_i, Rej_i
    Sigma = np.array([
        [ 1.0,  0.30,  0.0, -0.20],
        [ 0.30,  1.0,  0.40,  0.0],
        [ 0.0,  0.40,  1.0, -0.50],
        [-0.20,  0.0, -0.50,  1.0]
    ])
    
    # Validation PSD
    eigvals = np.linalg.eigvals(Sigma)
    assert np.all(eigvals > 0), f"Erreur mathématique : Sigma non semi-définie positive (vp={eigvals})"
    
    # 2. Copule Gaussienne
    # Tirage d'une N(0, Sigma)
    Z = np.random.multivariate_normal(mean=np.zeros(4), cov=Sigma, size=N)
    
    # Passage dans la CDF standard pour obtenir U ~ Uniforme(0, 1) avec la corrélation latente
    U = norm.cdf(Z)
    
    # 3. Distributions Marginales (Fonctions Quantiles)
    
    # A_i : Lognormale. Médiane cible = 2.5 ha.
    # median = exp(mu) => mu = ln(2.5) ~= 0.916.
    # sigma = 0.8 pour avoir un Q95 vers 9-10 ha.
    mu_A = np.log(2.5)
    sigma_A = 0.8
    # scipy lognorm prend le shape parameter s = sigma_A, et scale = exp(mu_A)
    A_i = lognorm.ppf(U[:, 0], s=sigma_A, scale=np.exp(mu_A))
    
    # R_i : Gamma. Moyenne cible = 5 t/ha, std = 1.5
    # k_R * theta_R = 5, k_R * theta_R^2 = 2.25 => theta_R = 0.45, k_R = 11.11
    # scipy gamma prend shape a = k_R, scale = theta_R
    k_R = 11.11
    theta_R = 0.45
    R_i = gamma.ppf(U[:, 1], a=k_R, scale=theta_R)
    
    # TR_i : Beta. Moyenne cible = 0.80. Concentration kappa = 10
    kappa_TR = 10
    alpha_TR = 0.80 * kappa_TR
    beta_TR = 0.20 * kappa_TR
    TR_i = beta.ppf(U[:, 2], a=alpha_TR, b=beta_TR)
    
    # Rej_i : Beta. Moyenne cible = 0.08. Concentration kappa = 25
    kappa_Rej = 25
    alpha_Rej = 0.08 * kappa_Rej
    beta_Rej = 0.92 * kappa_Rej
    Rej_i = beta.ppf(U[:, 3], a=alpha_Rej, b=beta_Rej)
    
    # 4. Déductions métier (Cohérence interne)
    
    # Petit bruit sur le rendement potentiel (epsilon >= 0)
    # Epsilon suit une petite demi-normale ou uniforme [0, 0.15]
    epsilon_i = np.random.uniform(0, 0.15, size=N)
    R_pot_i = R_i * (1 + epsilon_i)
    
    # Capacité estimée
    P_i = A_i * R_pot_i
    
    # Volume passé (garantit exactement TR_i = V/P)
    V_i = TR_i * P_i
    
    # Variables indépendantes
    # Distance
    d_i0 = np.random.uniform(10, 80, size=N)
    
    # Variétés (simplifié avec un tirage de Dirichlet)
    # Concentration vers un mix où Kent et Keitt dominent
    varietes = np.random.dirichlet([5, 3, 2], size=N) # [Kent, Keitt, Autres]
    p_Kent_i = varietes[:, 0]
    p_Keitt_i = varietes[:, 1]
    
    # 5. Compilation du DataFrame
    df = pd.DataFrame({
        'ID': [f'P{str(i).zfill(3)}' for i in range(1, N+1)],
        'A_i': A_i,
        'R_i': R_i,
        'TR_i': TR_i,
        'Rej_i': Rej_i,
        'P_i': P_i,
        'V_i_t1': V_i,
        'd_i0': d_i0,
        'p_Kent': p_Kent_i,
        'p_Keitt': p_Keitt_i
    })
    
    return df, Sigma

if __name__ == "__main__":
    df, Sigma = generate_dataset(N=100)
    
    output_path = os.path.join(os.path.dirname(__file__), 'simulated_producers.csv')
    df.to_csv(output_path, index=False)
    print(f"[OK] Jeu de données généré : {output_path}")
