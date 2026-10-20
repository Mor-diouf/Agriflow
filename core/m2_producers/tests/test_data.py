import sys
import os

# Ajout du dossier parent au path pour les imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from m2_producers.data.generator import generate_producers
from m2_producers.data.validation import audit_dataset
from m2_producers.config import GLOBAL_SEED

def run_tests():
    print("Exécution des tests de la Phase 1 (Génération & Validation)...")
    try:
        # Test 1 : Génération (vérifie implicitement que Sigma est SDP, sinon ValueError est levée)
        print("1. Test de génération des données...")
        df = generate_producers(seed=GLOBAL_SEED)
        print(f"   Succès : {len(df)} producteurs générés.")
        
        # Test 2 : Audit métier
        print("2. Test de validation métier...")
        is_valid = audit_dataset(df, verbose=False)
        if is_valid:
            print("   Succès : L'audit est passé (pas de valeurs négatives, bornes respectées).")
        else:
            print("   Échec : L'audit a détecté des violations.")
            return False
            
        print("\nTous les tests de la Phase 1 sont passés avec succès !")
        return True
        
    except Exception as e:
        print(f"Erreur lors des tests : {e}")
        return False

if __name__ == "__main__":
    run_tests()
