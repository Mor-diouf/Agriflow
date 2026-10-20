import pandas as pd
import numpy as np
import os
from sklearn.preprocessing import MinMaxScaler

def compute_scores_and_availability(input_path, output_path):
    print("=" * 60)
    print("       SCORING ET SOUS-MODELE DE DISPONIBILITE")
    print("=" * 60)
    
    df = pd.read_csv(input_path)
    
    # 1. Normalisation [0, 1] pour les variables de score
    scaler = MinMaxScaler()
    
    # TR_i, Rej_i, P_i se normalisent classiquement (plus c'est grand, plus c'est proche de 1)
    df['TR_norm'] = scaler.fit_transform(df[['TR_i']])
    df['Rej_norm'] = scaler.fit_transform(df[['Rej_i']])
    df['P_norm'] = scaler.fit_transform(df[['P_i']])
    
    # Distance : plus c'est loin, moins c'est prioritaire. On inverse la normalisation.
    d_min = df['d_i0'].min()
    d_max = df['d_i0'].max()
    df['d_norm'] = 1 - ((df['d_i0'] - d_min) / (d_max - d_min))
    
    # 2. Calcul des Scores Métiers
    # Poids fixés temporairement pour le prototype V1
    w_TR = 0.40
    w_d = 0.30
    w_P = 0.30
    
    # S_logistique (Priorité de collecte) en pourcentage [0, 100]
    df['Score_Logistique'] = (w_TR * df['TR_norm'] + w_d * df['d_norm'] + w_P * df['P_norm']) * 100
    
    # S_risque (Risque de défaillance/mauvaise qualité)
    w_Rej = 0.50
    w_fail = 0.50
    df['Score_Risque'] = (w_Rej * df['Rej_norm'] + w_fail * (1 - df['TR_norm'])) * 100
    
    print("\n--- 1. DISTRIBUTION DES SCORES ---")
    print(f"Score Logistique -> Min: {df['Score_Logistique'].min():.1f}, Max: {df['Score_Logistique'].max():.1f}, Mean: {df['Score_Logistique'].mean():.1f}")
    print(f"Score Risque     -> Min: {df['Score_Risque'].min():.1f}, Max: {df['Score_Risque'].max():.1f}, Mean: {df['Score_Risque'].mean():.1f}")
    
    # 3. Sous-modèle de Disponibilité (Pont vers Module 1)
    # On simule T=30 jours. Chaque producteur a une fenêtre de récolte [début, fin].
    np.random.seed(42)
    T_jours = 30
    
    # Fenêtres temporelles aléatoires (ex: durée de 10 jours)
    df['debut_recolte'] = np.random.randint(0, 20, size=len(df))
    df['fin_recolte'] = df['debut_recolte'] + 10
    
    # Volume total estimé que le producteur va réellement fournir cette saison
    df['V_estime'] = df['P_i'] * df['TR_i']
    
    # Volume journalier (q_it)
    df['q_journalier'] = df['V_estime'] / 10.0 # lissé sur 10 jours
    
    # On génère la matrice Q_it
    Q_it = np.zeros((len(df), T_jours))
    for i, row in df.iterrows():
        start = int(row['debut_recolte'])
        end = int(row['fin_recolte'])
        Q_it[i, start:end] = row['q_journalier']
        
    print("\n--- 2. SOUS-MODELE DE DISPONIBILITE (Q_it) ---")
    print(f"Matrice Q_it générée pour {len(df)} producteurs sur {T_jours} jours.")
    print(f"Exemple Producteur 0 (Cluster {df['Cluster'].iloc[0]}): P={df['P_i'].iloc[0]:.1f}t, q_j={df['q_journalier'].iloc[0]:.2f}t/j de J{df['debut_recolte'].iloc[0]} à J{df['fin_recolte'].iloc[0]-1}")
    
    # Sauvegarde
    df.to_csv(output_path, index=False)
    # On pourrait aussi sauvegarder Q_it dans un numpy / csv séparé pour M1
    np.save(output_path.replace('.csv', '_Qit.npy'), Q_it)
    
    print(f"\n[OK] Données scorées sauvegardées : {output_path}")

if __name__ == "__main__":
    input_path = os.path.join(os.path.dirname(__file__), 'segmented_producers.csv')
    output_path = os.path.join(os.path.dirname(__file__), 'scored_producers.csv')
    
    if not os.path.exists(input_path):
        print(f"Erreur : Le fichier {input_path} n'existe pas.")
    else:
        compute_scores_and_availability(input_path, output_path)
