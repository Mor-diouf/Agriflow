import numpy as np
import pandas as pd
from sklearn.metrics import adjusted_rand_score
from itertools import combinations
from project.config import M_REPLICATIONS, K_VALUES, GLOBAL_SEED
from project.data.generator import generate_producers
from project.clustering.kmeans_analysis import run_kmeans_analysis

def run_stability_analysis():
    """
    Exécute M_REPLICATIONS avec des seeds différents.
    Calcule Freq(K*) et la distribution des ARI pour K=2 (190 paires).
    """
    best_k_counts = {k: 0 for k in K_VALUES}
    
    # On stocke les labels K=2 pour les 20 réplications
    labels_k2_list = []
    
    print(f"Exécution de {M_REPLICATIONS} réplications pour l'analyse de stabilité...")
    
    for m in range(M_REPLICATIONS):
        # Seed différent pour chaque réplication mais reproductible
        seed_m = GLOBAL_SEED + m
        df = generate_producers(seed=seed_m)
        
        # Seed différent pour KMeans pour plus de robustesse
        res = run_kmeans_analysis(df, seed=100 + m)
        
        best_k = res["best_k"]
        best_k_counts[best_k] += 1
        
        labels_k2_list.append(res["labels_k2"])
        
    # Calcul Freq(K*)
    freq_k = {k: best_k_counts[k] / M_REPLICATIONS for k in K_VALUES}
    
    # Calcul ARI pairwise (190 combinaisons pour M=20)
    ari_scores = []
    # labels_k2_list contient M vecteurs de N labels
    # On calcule l'ARI entre toutes les paires (i, j) avec i < j
    for (i, j) in combinations(range(M_REPLICATIONS), 2):
        ari = adjusted_rand_score(labels_k2_list[i], labels_k2_list[j])
        ari_scores.append(ari)
        
    ari_metrics = {
        "mean": np.mean(ari_scores),
        "median": np.median(ari_scores),
        "std": np.std(ari_scores),
        "min": np.min(ari_scores),
        "max": np.max(ari_scores)
    }
    
    return {
        "freq_k": freq_k,
        "ari_metrics": ari_metrics,
        "ari_raw": ari_scores
    }

def print_clustering_conclusion(freq_k, ari_metrics):
    print("\n--- RÉSULTATS STABILITÉ ---")
    for k, freq in freq_k.items():
        print(f"K={k} est sélectionné dans {freq*100:.0f} % des réplications.")
        
    print(f"L'ARI moyen pour K=2 est proche de {ari_metrics['mean']:.3f}.")
    print("\nConclusion :")
    print("la segmentation K-Means n'est pas suffisamment stable dans le")
    print("scénario synthétique étudié pour être considérée comme une structure")
    print("robuste.")
