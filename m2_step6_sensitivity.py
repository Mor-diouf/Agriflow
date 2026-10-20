import pandas as pd
import numpy as np
import scipy.stats as stats
import os

def run_sensitivity_test(input_path):
    print("=" * 60)
    print("      CALIBRATION ET SENSIBILITÉ (KENDALL TAU_B)")
    print("=" * 60)
    
    df = pd.read_csv(input_path)
    
    # 1. Scénarios stratégiques (w_TR, w_d, w_P)
    scenarios = {
        "Base (Equilibré)": (1/3, 1/3, 1/3),
        "Fiabilité (TR)": (0.60, 0.20, 0.20),
        "Proximité (d)": (0.20, 0.60, 0.20),
        "Volume (P)": (0.20, 0.20, 0.60)
    }
    
    print("\n--- 1. TAU DE KENDALL (Scénarios fixes) ---")
    
    # Calcul des scores pour chaque scénario
    scores = {}
    ranks = {}
    for name, w in scenarios.items():
        s = (w[0] * df['TR_norm'] + w[1] * df['d_norm'] + w[2] * df['P_norm']) * 100
        scores[name] = s
        # Rank: le plus grand score a le rang 1 (ascending=False)
        ranks[name] = s.rank(method='average', ascending=False)
        
    # Calcul des Tau_b par rapport à la base
    base_ranks = ranks["Base (Equilibré)"]
    for name in scenarios.keys():
        if name != "Base (Equilibré)":
            tau, p_value = stats.kendalltau(base_ranks, ranks[name])
            print(f"Tau_b (Base vs {name:<14}) : {tau:.3f}")
            
    print("\n--- 2. EXPLORATION DU SIMPLEXE (Stabilité Top-10) ---")
    
    # Génération aléatoire sur le simplexe w1+w2+w3 = 1
    np.random.seed(42)
    n_sim = 1000
    simplex_weights = np.random.dirichlet((1, 1, 1), size=n_sim)
    
    # Matrice des scores (N producteurs, n_sim scenarios)
    TR_vec = df['TR_norm'].values
    d_vec = df['d_norm'].values
    P_vec = df['P_norm'].values
    
    # features matrix (N, 3)
    F = np.column_stack([TR_vec, d_vec, P_vec])
    
    # Scores = F @ W.T -> (N, n_sim)
    all_scores = F @ simplex_weights.T
    
    # Rangs: argsort(-all_scores, axis=0)
    top10_counts = np.zeros(len(df))
    for sim in range(n_sim):
        # Indices des 10 meilleurs scores pour ce simplexe
        top10_idx = np.argsort(-all_scores[:, sim])[:10]
        top10_counts[top10_idx] += 1
        
    df['Freq_Top10'] = top10_counts / n_sim
    
    print("Top 5 Producteurs les plus robustes (toujours dans le Top 10 peu importe les poids) :")
    top_robust = df.sort_values(by='Freq_Top10', ascending=False)[['ID', 'Cluster', 'TR_i', 'd_i0', 'P_i', 'Freq_Top10']].head(5)
    print(top_robust)
    
if __name__ == "__main__":
    path = os.path.join(os.path.dirname(__file__), 'scored_producers.csv')
    if os.path.exists(path):
        run_sensitivity_test(path)
    else:
        print("Fichier scored_producers.csv introuvable. Exécutez m2_scoring.py d'abord.")
