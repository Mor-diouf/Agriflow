from m2_producers.data.generator import generate_producers
from m2_producers.config import GLOBAL_SEED
from m2_producers.routing.distances import generate_distance_matrix
from m2_producers.scoring.scores import compute_logistic_score
from m2_producers.scoring.tiers import assign_priority_tier
from common.config import SCORE_WEIGHTS

def run_tests():
    print("Exécution des tests des niveaux de priorité...")
    df = generate_producers(seed=GLOBAL_SEED)
    D_global = generate_distance_matrix(len(df), seed=GLOBAL_SEED)
    df['d_i0'] = D_global[1:, 0]
    df['Score_Logistique'] = compute_logistic_score(df, w_TR=SCORE_WEIGHTS["TR"], w_d=SCORE_WEIGHTS["d"], w_P=SCORE_WEIGHTS["P"])

    df['Niveau'] = assign_priority_tier(df['Score_Logistique'])
    counts = df['Niveau'].value_counts().to_dict()
    print(f"   Répartition : {counts}")

    assert counts == {"prioritaire": 20, "standard": 40, "a_surveiller": 40}, counts
    # Tout producteur prioritaire doit avoir un meilleur score que tout producteur à surveiller
    assert df.loc[df['Niveau'] == "prioritaire", 'Score_Logistique'].min() > \
        df.loc[df['Niveau'] == "a_surveiller", 'Score_Logistique'].max()

    print("\nTous les tests des niveaux de priorité sont passés avec succès !")

if __name__ == "__main__":
    run_tests()
