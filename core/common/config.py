"""
=============================================================================
SM10 Agro — Configuration commune à tous les modules
Fichier : core/common/config.py

Source unique des paramètres partagés entre M1 (tournées), M2 (producteurs),
M3 (prévision) et M4 (scénarios). Un module ne doit JAMAIS redéfinir une
de ces valeurs localement : il l'importe d'ici.

Les choix sont justifiés dans docs/DECISIONS.md.
=============================================================================
"""

# ─────────────────────────────────────────────────────────────────────────────
# REPRODUCTIBILITÉ
# ─────────────────────────────────────────────────────────────────────────────
GLOBAL_SEED = 42


# ─────────────────────────────────────────────────────────────────────────────
# ZONES GÉOGRAPHIQUES
# ─────────────────────────────────────────────────────────────────────────────
# Noms réels des départements de Casamance (paramètres associés simulés).
ZONES = ['Bignona', 'Oussouye', 'Ziguinchor', 'Sédhiou', 'Kolda']


# ─────────────────────────────────────────────────────────────────────────────
# CAPACITÉ DE L'USINE  (décision D1)
# ─────────────────────────────────────────────────────────────────────────────
# [HYPOTHÈSE SIMULÉE] — Capacité annuelle déclarée 8 500 t/an répartie sur
# 300 jours ouvrés. Seule valeur du projet dont la source est documentée.
# Alternative à valider avec l'usine : 8 500 t / 90 jours de saison ≈ 94 t/j.
FACTORY_CAPACITY_ANNUAL_T = 8500.0
FACTORY_WORKING_DAYS_PER_YEAR = 300
FACTORY_CAPACITY_DAILY_T = round(FACTORY_CAPACITY_ANNUAL_T / FACTORY_WORKING_DAYS_PER_YEAR, 1)  # 28.3 t/j
FACTORY_CAPACITY_WEEKLY_T = FACTORY_CAPACITY_DAILY_T * 7                                       # 198.1 t/sem


# ─────────────────────────────────────────────────────────────────────────────
# SCORING DES PRODUCTEURS  (décision D2)
# ─────────────────────────────────────────────────────────────────────────────
# Poids du score logistique : fiabilité (TR), proximité (d), production (P).
# Pondération égale = scénario « Base » de l'analyse de sensibilité M2.
SCORE_WEIGHTS = {"TR": 1 / 3, "d": 1 / 3, "P": 1 / 3}


# ─────────────────────────────────────────────────────────────────────────────
# NIVEAUX DE PRIORITÉ DES PRODUCTEURS  (décision D2)
# ─────────────────────────────────────────────────────────────────────────────
# La segmentation K-Means n'est pas stable (ARI moyen ≈ 0 sur 20 réplications,
# cf. m2_producers/results/tables/rapport_final.md). Les producteurs sont donc
# classés par quantiles du score logistique, qui lui est robuste
# (Kendall tau-b 0.62 à 0.76 entre scénarios de poids).
# Clé = niveau, valeur = quantile minimal du score pour y appartenir.
PRIORITY_TIERS = {
    "prioritaire": 0.80,   # 20 % des producteurs les mieux notés
    "standard": 0.40,      # 40 % suivants
    "a_surveiller": 0.0,   # 40 % restants
}
