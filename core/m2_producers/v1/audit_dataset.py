import pandas as pd
import numpy as np
import os

def audit_dataset(df_path):
    print("=" * 60)
    print("        AUDIT STATISTIQUE DU DATASET SIMULE")
    print("=" * 60)
    
    df = pd.read_csv(df_path)
    
    # 1. Vérification des distributions (Médianes, Quantiles)
    print("\n--- 1. AUDIT DES DISTRIBUTIONS MARGINALES ---")
    A_i = df['A_i']
    print(f"Surface A_i    -> Median: {A_i.median():.2f} ha, Mean: {A_i.mean():.2f}, Q90: {A_i.quantile(0.90):.2f}, Q95: {A_i.quantile(0.95):.2f}, Q99: {A_i.quantile(0.99):.2f}")
    
    R_i = df['R_i']
    print(f"Rendement R_i  -> Median: {R_i.median():.2f} t/ha, Mean: {R_i.mean():.2f}")
    
    TR_i = df['TR_i']
    print(f"Taux Real. TR_i-> Mean: {TR_i.mean():.2f}, Q10: {TR_i.quantile(0.10):.2f}, Q50: {TR_i.quantile(0.50):.2f}")
    
    Rej_i = df['Rej_i']
    print(f"Taux Rejet Rej_i-> Mean: {Rej_i.mean():.3f}, Q90: {Rej_i.quantile(0.90):.3f}, Q95: {Rej_i.quantile(0.95):.3f}, Q99: {Rej_i.quantile(0.99):.3f}")
    
    # 2. Vérification de la matrice de corrélation
    print("\n--- 2. AUDIT DE LA MATRICE DE CORRELATION EMPIRIQUE (Pearson) ---")
    cols_kmeans = ['A_i', 'R_i', 'TR_i', 'Rej_i']
    corr_empirique = df[cols_kmeans].corr()
    print(corr_empirique.round(2))
    
    # Comparaison rapide avec la latente
    latente = np.array([
        [ 1.0,  0.30,  0.0, -0.20],
        [ 0.30,  1.0,  0.40,  0.0],
        [ 0.0,  0.40,  1.0, -0.50],
        [-0.20,  0.0, -0.50,  1.0]
    ])
    diff_corr = np.abs(corr_empirique.values - latente)
    print(f"-> Ecart max entre corrélation latente et de Pearson : {np.max(diff_corr):.2f}")
    
    # 3. Contraintes Métier
    print("\n--- 3. AUDIT DES CONTRAINTES METIER ---")
    
    # P_i doit être >= V_i_t1 puisque TR_i <= 1
    violations_cap = df[df['V_i_t1'] > df['P_i']]
    print(f"Violations V_i > P_i : {len(violations_cap)}")
    
    # TR_i doit être exactement égal à V_i / P_i
    calc_tr = df['V_i_t1'] / df['P_i']
    diff_tr = np.abs(df['TR_i'] - calc_tr)
    print(f"Erreur max sur l'identité TR = V/P : {diff_tr.max():.2e}")
    
    # Distance
    d_i0 = df['d_i0']
    print(f"Distance d_i0  -> Min: {d_i0.min():.2f} km, Max: {d_i0.max():.2f} km")
    
    # Somme des variétés <= 1.0 (approximativement, puisqu'on a p_Kent + p_Keitt <= 1)
    sum_var = df['p_Kent'] + df['p_Keitt']
    print(f"Max(p_Kent + p_Keitt) = {sum_var.max():.2f}")

    if len(violations_cap) == 0 and diff_tr.max() < 1e-5:
        print("\n[SUCCESS] Le dataset a passé l'audit avec succès ! Il est prêt pour K-Means.")
    else:
        print("\n[ERREUR] Le dataset n'a pas passé l'audit métier.")

if __name__ == "__main__":
    path = os.path.join(os.path.dirname(__file__), 'simulated_producers.csv')
    if not os.path.exists(path):
        print("Erreur : Le fichier dataset n'existe pas. Veuillez exécuter m2_data_generation.py d'abord.")
    else:
        audit_dataset(path)
