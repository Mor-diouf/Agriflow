import sys
import os
import numpy as np

# Ajout du dossier parent au path pour les imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from project.data.generator import generate_producers
from project.config import GLOBAL_SEED
from project.scoring.sensitivity import run_sensitivity_analysis, print_sensitivity_conclusion

def run_tests():
    print("Exécution des tests de la Phase 3 (Scoring & Sensibilité)...")
    try:
        df = generate_producers(seed=GLOBAL_SEED)
        
        # Ajout fictif de la distance d_i0 pour tester le scoring
        np.random.seed(GLOBAL_SEED)
        df['d_i0'] = np.random.uniform(10, 50, size=len(df))
        
        kendall_results, df_topk = run_sensitivity_analysis(df)
        print_sensitivity_conclusion(kendall_results, df_topk)
        
        # Vérification simple
        if len(kendall_results) != 3:
            print("[AVERTISSEMENT] Il manque des résultats Kendall.")
            return False
            
        print("\nTous les tests de la Phase 3 sont passés avec succès !")
        return True
    except Exception as e:
        print(f"Erreur lors des tests de la Phase 3 : {e}")
        return False

if __name__ == "__main__":
    run_tests()
