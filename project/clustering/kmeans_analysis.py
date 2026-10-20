import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from project.config import K_VALUES, N_INIT

def run_kmeans_analysis(df: pd.DataFrame, seed: int = 100):
    """
    Standardise les variables X=(A,R,TR,Rej) et exécute K-Means pour K dans K_VALUES.
    Retourne K*, le score de silhouette optimal et les labels.
    """
    features = ['A_i', 'R_i', 'TR_i', 'Rej_i']
    X = df[features].copy()
    
    # 1. Standardisation
    scaler = StandardScaler()
    Z = scaler.fit_transform(X)
    
    # 2. Exécution pour K dans {2, 3, 4, 5, 6}
    best_k = -1
    best_sil = -1
    best_labels = None
    all_silhouettes = {}
    
    # On stocke aussi les labels pour K=2 pour le calcul de l'ARI
    labels_k2 = None
    
    for k in K_VALUES:
        kmeans = KMeans(n_clusters=k, random_state=seed, n_init=N_INIT)
        labels = kmeans.fit_predict(Z)
        sil = silhouette_score(Z, labels)
        
        all_silhouettes[k] = sil
        
        if k == 2:
            labels_k2 = labels
            
        if sil > best_sil:
            best_sil = sil
            best_k = k
            best_labels = labels
            
    return {
        "best_k": best_k,
        "best_sil": best_sil,
        "best_labels": best_labels,
        "all_silhouettes": all_silhouettes,
        "labels_k2": labels_k2
    }
