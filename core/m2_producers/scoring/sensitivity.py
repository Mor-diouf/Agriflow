import pandas as pd
import numpy as np
import scipy.stats as stats
from m2_producers.config import N_SIMPLEX_SCENARIOS, TOP_K_VALUES, SCENARIOS_FIXES
from m2_producers.scoring.scores import compute_logistic_score

def run_sensitivity_analysis(df: pd.DataFrame):
    """
    Exécute l'analyse de sensibilité : 
    1. Calcule tau_b pour les scénarios fixes
    2. Explore le simplexe (Monte-Carlo)
    """
    
    # 1. Scénarios Fixes & Kendall Tau-b
    scores_scenarios = {}
    ranks_scenarios = {}
    
    for name, w in SCENARIOS_FIXES.items():
        s = compute_logistic_score(df, w_TR=w[0], w_d=w[1], w_P=w[2])
        scores_scenarios[name] = s
        # Rang : 1 = meilleur score (d'où le ascending=False)
        ranks_scenarios[name] = s.rank(method='average', ascending=False)
        
    base_ranks = ranks_scenarios["Base"]
    
    kendall_results = {}
    for name in SCENARIOS_FIXES.keys():
        if name != "Base":
            tau, p_value = stats.kendalltau(base_ranks, ranks_scenarios[name])
            kendall_results[name] = tau
            
    # 2. Exploration du Simplexe
    np.random.seed(42)
    simplex_weights = np.random.dirichlet([1, 1, 1], size=N_SIMPLEX_SCENARIOS)
    
    # Pré-calcul des normalisations pour aller vite
    TR_min, TR_max = df['TR_i'].min(), df['TR_i'].max()
    P_min, P_max = df['P_i'].min(), df['P_i'].max()
    d_min, d_max = df['d_i0'].min(), df['d_i0'].max()
    
    TR_norm = (df['TR_i'] - TR_min) / (TR_max - TR_min)
    P_norm = (df['P_i'] - P_min) / (P_max - P_min)
    d_norm = 1.0 - (df['d_i0'] - d_min) / (d_max - d_min)
    
    F = np.column_stack([TR_norm.values, d_norm.values, P_norm.values])
    # all_scores.shape = (N, n_sim)
    all_scores = F @ simplex_weights.T
    
    topk_freq = {k: np.zeros(len(df)) for k in TOP_K_VALUES}
    
    for sim in range(N_SIMPLEX_SCENARIOS):
        scores_sim = all_scores[:, sim]
        # argsort(-scores) donne les indices triés décroissants
        sorted_idx = np.argsort(-scores_sim)
        for k in TOP_K_VALUES:
            top_k_idx = sorted_idx[:k]
            topk_freq[k][top_k_idx] += 1
            
    # Normalisation pour avoir des fréquences
    for k in TOP_K_VALUES:
        topk_freq[k] /= N_SIMPLEX_SCENARIOS
        
    df_topk = pd.DataFrame(topk_freq)
    df_topk.columns = [f"Freq_Top_{k}" for k in TOP_K_VALUES]
    df_topk['ID'] = df['ID']
    
    return kendall_results, df_topk

def print_sensitivity_conclusion(kendall_results, df_topk):
    print("\n--- RÉSULTATS SENSIBILITÉ (KENDALL TAU-B) ---")
    for name, tau in kendall_results.items():
        print(f"Base vs {name:<12} : {tau:.3f}")
        
    print("\n--- PRODUCTEURS ULTRA-ROBUSTES (TOP-10) ---")
    robust = df_topk.sort_values(by="Freq_Top_10", ascending=False).head(5)
    print(robust.to_string(index=False))
