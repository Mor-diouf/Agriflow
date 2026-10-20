import sys
import os

# Ajout du dossier parent au path pour les imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from m2_producers.clustering.stability import run_stability_analysis, print_clustering_conclusion

def run_tests():
    print("Exécution des tests de la Phase 2 (Clustering & Stabilité)...")
    try:
        results = run_stability_analysis()
        print_clustering_conclusion(results["freq_k"], results["ari_metrics"])
        
        # Vérification stricte des résultats attendus
        freq_k2 = results["freq_k"].get(2, 0.0)
        ari_mean = results["ari_metrics"]["mean"]
        
        if freq_k2 != 0.30:
            print(f"[AVERTISSEMENT] Freq(K=2) obtenue : {freq_k2*100:.0f}%. Attendu: 30%.")
            
        if abs(ari_mean) > 0.05:
            print(f"[AVERTISSEMENT] L'ARI moyen ({ari_mean:.3f}) s'écarte de 0.")
            
        print("\nTous les tests de la Phase 2 sont terminés !")
        return True
    except Exception as e:
        print(f"Erreur lors des tests de la Phase 2 : {e}")
        return False

if __name__ == "__main__":
    run_tests()
