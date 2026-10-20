import sys
import os
import numpy as np

# Ajout du dossier parent au path pour les imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from m2_producers.data.generator import generate_producers
from m2_producers.config import GLOBAL_SEED
from common.config import SCORE_WEIGHTS
from m2_producers.availability.temporal_model import generate_temporal_availability
from m2_producers.routing.distances import generate_distance_matrix, extract_daily_distances
from m2_producers.scoring.scores import compute_logistic_score
from m2_producers.routing.comparison import run_routing_comparison

def run_tests():
    print("Exécution des tests de la Phase 4 (Disponibilité & Routage)...")
    try:
        # 1. Données
        df = generate_producers(seed=GLOBAL_SEED)
        
        # 2. Distances globales
        D_global = generate_distance_matrix(len(df), seed=GLOBAL_SEED)
        df['d_i0'] = D_global[1:, 0]
        
        # 3. Scores
        df['Score_Logistique'] = compute_logistic_score(df, w_TR=SCORE_WEIGHTS["TR"], w_d=SCORE_WEIGHTS["d"], w_P=SCORE_WEIGHTS["P"])
        
        # 4. Disponibilité
        Q_it = generate_temporal_availability(df, n_days=10, seed=GLOBAL_SEED)
        
        # Sélection d'un sous-ensemble pour le test MILP (jour 0, 5 producteurs)
        t_test = 0
        active_indices = np.where(Q_it[:, t_test] > 0)[0][:5]
        
        df_active = df.iloc[active_indices].copy()
        Q_it_active = Q_it[active_indices, t_test]
        
        D_t = extract_daily_distances(D_global, active_indices)
        
        # 5. Comparaison End-to-End
        res_A, res_B, V_cible = run_routing_comparison(df_active, Q_it_active, D_t, t=t_test)

        if res_A and res_B:
            print(f"   Volume cible : {V_cible:.2f} t")
            for metric in ['D_total', 'T_total', 'S_moyen', 'R_agg']:
                print(f"   {metric} : M1 = {res_A[metric]:.2f} | M1+M2 = {res_B[metric]:.2f}")
            print(f"   Statut solveur (M1+M2) : {res_B['Status']}")
            print("\nTous les tests de la Phase 4 sont passés avec succès !")
            return True
        else:
            print("Erreur: Le MILP n'a pas trouvé de solution optimale.")
            return False
            
    except Exception as e:
        print(f"Erreur lors des tests de la Phase 4 : {e}")
        return False

if __name__ == "__main__":
    run_tests()
