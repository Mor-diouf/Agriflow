import os
import numpy as np

# =============================================================================
# CONFIGURATION CENTRALE DU MODULE 2
# =============================================================================

# --- Paramètres Globaux ---
N_PRODUCERS = 100
GLOBAL_SEED = 42
M_REPLICATIONS = 20

# --- Paramètres de Clustering ---
K_VALUES = [2, 3, 4, 5, 6]
N_INIT = 50

# --- Paramètres de Sensibilité (Scoring) ---
N_SIMPLEX_SCENARIOS = 1000
TOP_K_VALUES = [5, 10, 20]

# Scénarios de poids fixes (w_TR, w_d, w_P)
SCENARIOS_FIXES = {
    "Base": (1/3, 1/3, 1/3),
    "Fiabilite": (0.60, 0.20, 0.20),
    "Proximite": (0.20, 0.60, 0.20),
    "Volume": (0.20, 0.20, 0.60)
}

# --- Paramètres de Génération de Données (Copule Gaussienne) ---
# Matrice de corrélation
RHO_A_R = 0.30
RHO_R_TR = 0.40
RHO_TR_REJ = -0.50
RHO_A_REJ = -0.20

SIGMA = np.array([
    [1.0,        RHO_A_R,    0.0,         RHO_A_REJ],
    [RHO_A_R,    1.0,        RHO_R_TR,    0.0],
    [0.0,        RHO_R_TR,   1.0,         RHO_TR_REJ],
    [RHO_A_REJ,  0.0,        RHO_TR_REJ,  1.0]
])

# Paramètres des lois marginales
MARGINALS = {
    "A": {"type": "lognormal", "mu": np.log(2.5), "sigma": 0.8},
    "R": {"type": "gamma", "alpha": 11.11, "beta": 1/0.45}, # Note: scipy utilise scale = 1/beta = 0.45
    "TR": {"type": "beta", "alpha": 8.0, "beta": 2.0},
    "Rej": {"type": "beta", "alpha": 2.0, "beta": 23.0}
}

# --- Dossiers du projet ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(BASE_DIR, "results")
RAW_DIR = os.path.join(RESULTS_DIR, "raw")
TABLES_DIR = os.path.join(RESULTS_DIR, "tables")
FIGURES_DIR = os.path.join(RESULTS_DIR, "figures")
