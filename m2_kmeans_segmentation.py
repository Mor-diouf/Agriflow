import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score
import os

def run_kmeans_segmentation(input_path, output_path):
    print("=" * 60)
    print("       SEGMENTATION NON SUPERVISEE (K-MEANS)")
    print("=" * 60)
    
    # 1. Chargement des données
    df = pd.read_csv(input_path)
    
    # Variables de clustering métier validées
    cluster_features = ['A_i', 'R_i', 'TR_i', 'Rej_i']
    X = df[cluster_features]
    
    # 2. Standardisation Z*
    scaler = StandardScaler()
    Z = scaler.fit_transform(X)
    
    # 3. Test expérimental de K
    print("\n--- 1. ÉVALUATION EXPÉRIMENTALE DU NOMBRE DE CLUSTERS (K) ---")
    K_range = [2, 3, 4, 5, 6]
    best_k = -1
    best_sil = -1
    
    results = []
    
    for k in K_range:
        kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = kmeans.fit_predict(Z)
        
        sil = silhouette_score(Z, labels)
        ch = calinski_harabasz_score(Z, labels)
        db = davies_bouldin_score(Z, labels)
        
        results.append((k, sil, ch, db))
        print(f"K={k} | Silhouette: {sil:.3f} | Calinski-Harabasz: {ch:.1f} | Davies-Bouldin: {db:.3f}")
        
        if sil > best_sil:
            best_sil = sil
            best_k = k
            
    print(f"\n-> Meilleur K expérimental (selon Silhouette) : K = {best_k}")
    
    # 4. Modèle final avec le meilleur K
    print(f"\n--- 2. PROFILS DES CLUSTERS (K={best_k}) ---")
    final_kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
    df['Cluster'] = final_kmeans.fit_predict(Z)
    
    # 5. Analyse des profils (moyennes des caractéristiques non-standardisées par cluster)
    profile_summary = df.groupby('Cluster')[cluster_features].mean()
    profile_summary['Count'] = df.groupby('Cluster').size()
    
    # On réorganise les colonnes pour que Count soit au début
    cols = ['Count'] + cluster_features
    profile_summary = profile_summary[cols].round(3)
    print("\nMoyennes par Cluster :")
    print(profile_summary)
    
    # 6. Sauvegarde
    df.to_csv(output_path, index=False)
    print(f"\n[OK] Données segmentées sauvegardées : {output_path}")

if __name__ == "__main__":
    input_path = os.path.join(os.path.dirname(__file__), 'simulated_producers.csv')
    output_path = os.path.join(os.path.dirname(__file__), 'segmented_producers.csv')
    
    if not os.path.exists(input_path):
        print(f"Erreur : Le fichier {input_path} n'existe pas.")
    else:
        run_kmeans_segmentation(input_path, output_path)
