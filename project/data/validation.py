import pandas as pd
import numpy as np

def audit_dataset(df: pd.DataFrame, verbose: bool = True) -> bool:
    """
    Effectue un audit statistique et logique des données générées.
    Retourne True si toutes les règles métier sont respectées.
    """
    if verbose:
        print("=" * 50)
        print("           AUDIT AUTOMATIQUE DES DONNEES")
        print("=" * 50)
        
    cols_to_check = ['A_i', 'R_i', 'TR_i', 'Rej_i', 'P_i', 'V_i']
    
    if verbose:
        print("\n--- 1. Statistiques Descriptives ---")
        stats = df[cols_to_check].describe(percentiles=[0.05, 0.25, 0.50, 0.75, 0.95]).T
        # On ne garde que les colonnes utiles demandees
        stats = stats[['mean', '50%', 'std', 'min', 'max', '5%', '25%', '75%', '95%']]
        print(stats.round(3).to_string())
        
    if verbose:
        print("\n--- 2. Contrôles Métier ---")
        
    is_valid = True
    errors = []
    
    # A > 0
    if not (df['A_i'] > 0).all():
        errors.append("A_i n'est pas strictement positif pour tous les producteurs.")
    
    # R > 0
    if not (df['R_i'] > 0).all():
        errors.append("R_i n'est pas strictement positif pour tous les producteurs.")
        
    # 0 <= TR <= 1
    if not ((df['TR_i'] >= 0) & (df['TR_i'] <= 1)).all():
        errors.append("TR_i n'est pas dans [0, 1].")
        
    # 0 <= Rej <= 1
    if not ((df['Rej_i'] >= 0) & (df['Rej_i'] <= 1)).all():
        errors.append("Rej_i n'est pas dans [0, 1].")
        
    # P > 0
    if not (df['P_i'] > 0).all():
        errors.append("P_i n'est pas strictement positif.")
        
    # V >= 0
    if not (df['V_i'] >= 0).all():
        errors.append("V_i n'est pas positif ou nul.")
        
    # Identité numérique: V_i = TR_i * P_i
    diff = np.abs(df['V_i'] - (df['TR_i'] * df['P_i']))
    if (diff > 1e-8).any():
        errors.append("Incohérence V_i != TR_i * P_i")
        
    if len(errors) > 0:
        is_valid = False
        if verbose:
            print("[ECHEC] Des violations métier ont été détectées :")
            for e in errors:
                print(f"  - {e}")
    else:
        if verbose:
            print("[SUCCES] Toutes les contraintes métier et d'identité sont respectées.")
            
    return is_valid
