import numpy as np
import pandas as pd
from scipy.stats import norm, lognorm, gamma, beta
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, adjusted_rand_score
import os

def generate_dataset_replication(seed, N=100):
    np.random.seed(seed)
    Sigma = np.array([
        [ 1.0,  0.30,  0.0, -0.20],
        [ 0.30,  1.0,  0.40,  0.0],
        [ 0.0,  0.40,  1.0, -0.50],
        [-0.20,  0.0, -0.50,  1.0]
    ])
    Z = np.random.multivariate_normal(mean=np.zeros(4), cov=Sigma, size=N)
    U = norm.cdf(Z)
    
    A_i = lognorm.ppf(U[:, 0], s=0.8, scale=np.exp(np.log(2.5)))
    R_i = gamma.ppf(U[:, 1], a=11.11, scale=0.45)
    TR_i = beta.ppf(U[:, 2], a=8.0, b=2.0)
    Rej_i = beta.ppf(U[:, 3], a=2.0, b=23.0)
    
    df = pd.DataFrame({'A_i': A_i, 'R_i': R_i, 'TR_i': TR_i, 'Rej_i': Rej_i})
    return df

def run_stability_test():
    print("=" * 60)
    print("       TEST DE STABILITÉ K-MEANS (ARI & RÉPLICATIONS)")
    print("=" * 60)
    
    M = 20
    K_range = [2, 3, 4, 5, 6]
    
    best_k_counts = {k: 0 for k in K_range}
    ari_scores_k2 = []
    
    # Référence pour calculer l'ARI : on va stocker les labels du premier dataset
    ref_labels_k2 = None
    
    print(f"Exécution de {M} réplications avec n_init=50...\n")
    
    for m in range(M):
        df = generate_dataset_replication(seed=42 + m)
        scaler = StandardScaler()
        Z = scaler.fit_transform(df)
        
        best_sil = -1
        best_k = -1
        current_labels_k2 = None
        
        for k in K_range:
            kmeans = KMeans(n_clusters=k, random_state=100 + m, n_init=50)
            labels = kmeans.fit_predict(Z)
            sil = silhouette_score(Z, labels)
            
            if sil > best_sil:
                best_sil = sil
                best_k = k
                
            if k == 2:
                current_labels_k2 = labels
                
        best_k_counts[best_k] += 1
        
        if m == 0:
            ref_labels_k2 = current_labels_k2
        else:
            # Note: ARI entre différents tirages (X différent) n'a de sens que si 
            # on suppose que les producteurs gardent le même indice (ce qui est vrai ici
            # car généré par la même séquence, mais les valeurs sont différentes).
            # L'ARI mesurera donc si les producteurs tombent toujours ensemble.
            ari = adjusted_rand_score(ref_labels_k2, current_labels_k2)
            ari_scores_k2.append(ari)
            
    print("--- 1. STABILITÉ DU NOMBRE DE CLUSTERS (K*) ---")
    for k in K_range:
        pct = (best_k_counts[k] / M) * 100
        print(f"K = {k} sélectionné dans {pct:.1f}% des réplications ({best_k_counts[k]}/{M})")
        
    print("\n--- 2. STABILITÉ DES PARTITIONS (ARI pour K=2) ---")
    mean_ari = np.mean(ari_scores_k2)
    min_ari = np.min(ari_scores_k2)
    print(f"Adjusted Rand Index (moyen) : {mean_ari:.3f}")
    print(f"Adjusted Rand Index (min)   : {min_ari:.3f}")
    
    if (best_k_counts[2] / M) >= 0.80 and mean_ari > 0.70:
        print("\n[SUCCESS] Structure latente K=2 robuste selon nos hypothèses de simulation.")
    else:
        print("\n[ATTENTION] La structure K=2 n'atteint pas les seuils de robustesse métier.")

if __name__ == "__main__":
    run_stability_test()
