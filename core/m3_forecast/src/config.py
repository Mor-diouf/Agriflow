"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : config.py

Paramètres de configuration globaux du Module 3.
Centralise les constantes, chemins et paramètres partagés entre
les différents sous-modules.
=============================================================================
"""

import os

from common.config import ZONES, GLOBAL_SEED, FACTORY_CAPACITY_DAILY_T

# ─────────────────────────────────────────────────────────────────────────────
# CHEMINS
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_RAW_DIR = os.path.join(BASE_DIR, 'data', 'raw')
DATA_PROCESSED_DIR = os.path.join(BASE_DIR, 'data', 'processed')
RESULTS_DIR = os.path.join(BASE_DIR, 'results')
SRC_DIR = os.path.join(BASE_DIR, 'src')

# Créer les répertoires s'ils n'existent pas
for _d in [DATA_RAW_DIR, DATA_PROCESSED_DIR, RESULTS_DIR]:
    os.makedirs(_d, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# ZONES GÉOGRAPHIQUES
# ─────────────────────────────────────────────────────────────────────────────
# [DONNÉE SIMULÉE] — Noms réels des départements de Casamance.
# Les paramètres numériques associés sont entièrement simulés.
ZONE_NAMES = ZONES
N_ZONES = len(ZONES)


# ─────────────────────────────────────────────────────────────────────────────
# PARAMÈTRES TEMPORELS
# ─────────────────────────────────────────────────────────────────────────────
WEEKS_PER_YEAR = 52
N_SEASONS = 5          # Nombre de saisons historiques à simuler

# Saison de récolte : mai–septembre, semaines calendaires 18 à 39.
# [HYPOTHÈSE] — Fenêtre saisonnière typique de la mangue en Casamance.
# À noter : la génération utilise des sigmoïdes logistiques pour les
# transitions (semaines 15-17 en entrée, 40-42 en sortie) et impose
# des zéros stricts pour w <= 14 et w >= 43.
SEASON_START_WEEK = 18
SEASON_END_WEEK = 39
SEASON_WEEKS = list(range(SEASON_START_WEEK, SEASON_END_WEEK + 1))

# Année de début de la simulation
START_YEAR = 2021


# ─────────────────────────────────────────────────────────────────────────────
# CAPACITÉ DE L'USINE
# ─────────────────────────────────────────────────────────────────────────────
# [HYPOTHÈSE SIMULÉE] — Capacité annuelle déclarée : 8 500 t/an,
# répartie sur 300 jours ouvrés → 28.3 t/jour.
# Source : sm10_module1.py, ligne 110.
FACTORY_CAPACITY_DAILY = FACTORY_CAPACITY_DAILY_T        # t/jour — common/config.py
FACTORY_CAPACITY_WEEKLY = FACTORY_CAPACITY_DAILY * 7    # ≈ 198 t/semaine


# ─────────────────────────────────────────────────────────────────────────────
# SIMULATION
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_SEED = GLOBAL_SEED


# ─────────────────────────────────────────────────────────────────────────────
# ÉVALUATION ET INTERVALLES DE PRÉVISION
# ─────────────────────────────────────────────────────────────────────────────
CONFIDENCE_LEVEL = 0.90                     # 1 - α pour les intervalles
ALPHA = 1.0 - CONFIDENCE_LEVEL             # α = 0.10


# ─────────────────────────────────────────────────────────────────────────────
# RETARDS MÉTÉOROLOGIQUES
# ─────────────────────────────────────────────────────────────────────────────
# Plage de retards à explorer dans la corrélation croisée Y vs P/T/H.
# [HYPOTHÈSE] — Les précipitations influencent le volume de récolte avec
# un décalage de 5 à 8 semaines (physiologie du manguier : floraison →
# nouaison → grossissement du fruit).
MAX_LAG_WEEKS = 12


# ─────────────────────────────────────────────────────────────────────────────
# SEUILS DE DIAGNOSTIC
# ─────────────────────────────────────────────────────────────────────────────
VIF_THRESHOLD = 5.0                # Seuil de multicolinéarité (VIF)
MIN_DETECTION_TONNES = 0.05        # 50 kg — seuil opérationnel minimum
