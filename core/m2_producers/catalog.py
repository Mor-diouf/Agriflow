import pandas as pd

from common.config import GLOBAL_SEED, SCORE_WEIGHTS
from m2_producers.data.generator import generate_producers
from m2_producers.routing.distances import generate_distance_matrix
from m2_producers.scoring.scores import compute_logistic_score
from m2_producers.scoring.tiers import assign_priority_tier


def build_producer_table(seed: int = GLOBAL_SEED) -> pd.DataFrame:
    """
    Table de référence des producteurs : caractéristiques simulées, distance
    à l'usine, score logistique et niveau de priorité (même chaîne que main.py).
    """
    df = generate_producers(seed=seed)
    D_global = generate_distance_matrix(len(df), seed=seed)
    df['d_i0'] = D_global[1:, 0]
    df['Score_Logistique'] = compute_logistic_score(
        df, w_TR=SCORE_WEIGHTS["TR"], w_d=SCORE_WEIGHTS["d"], w_P=SCORE_WEIGHTS["P"]
    )
    df['Niveau'] = assign_priority_tier(df['Score_Logistique'])
    return df
