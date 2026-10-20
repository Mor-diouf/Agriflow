import pandas as pd

from common.config import PRIORITY_TIERS


def assign_priority_tier(scores: pd.Series) -> pd.Series:
    """
    Classe chaque producteur dans un niveau de priorité selon le rang
    percentile de son score logistique (seuils : common.config.PRIORITY_TIERS).
    Remplace la segmentation K-Means, jugée instable (ARI moyen ≈ 0).
    """
    pct_rank = scores.rank(pct=True, method="first")
    tiers_desc = sorted(PRIORITY_TIERS.items(), key=lambda kv: kv[1], reverse=True)

    def tier_of(p: float) -> str:
        for name, threshold in tiers_desc:
            if p > threshold:
                return name
        return tiers_desc[-1][0]

    return pct_rank.map(tier_of)
