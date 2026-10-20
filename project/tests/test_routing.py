import sys
import os
import numpy as np

# Ajout du dossier parent au path pour les imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from project.data.generator import generate_producers
from project.config import GLOBAL_SEED
from project.availability.temporal_model import generate_temporal_availability
from project.routing.distances import generate_distance_matrix, extract_daily_distances
from project.scoring.scores import compute_logistic_score
from project.routing.comparison import run_routing_comparison, print_routing_conclusion

def run_tests():
    print("Exécution des tests de la Phase 4 (Disponibilité & Routage)...")
    try:
        # 1. Données
        df = generate_producers(seed=GLOBAL_SEED)
        
        # 2. Distances globales
        D_global = generate_distance_matrix(len(df), seed=GLOBAL_SEED)
        df['d_i0'] = D_global[1:, 0]
        
        # 3. Scores
        df['Score_Logistique'] = compute_logistic_score(df, w_TR=1/3, w_d=1/3, w_P=1/3)
        
        # 4. Disponibilité
        Q_it = generate_temporal_availability(df, n_days=10, seed=GLOBAL_SEED)
        
        # Sélection d'un sous-ensemble pour le test MILP (jour 0, 5 producteurs)
        t_test = 0
        active_indices = np.where(Q_it[:, t_test] > 0)[0][:5]
        
        df_active = df.iloc[active_indices].copy()
        Q_it_active = Q_it[active_indices, t_test]
        
        D_t = extract_daily_distances(D_global, active_indices)
        
        # 5. Comparaison End-to-End
        res_A, res_B, deltas = run_routing_comparison(df_active, Q_it_active, D_t, t=t_test)
        
        if res_A and res_B:
            print_routing_conclusion(res_A, res_B, deltas)
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
