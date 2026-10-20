# =============================================================================
# SM10 — Module 1 : Optimisation des tournées de collecte de mangues (Casamance)
# Implémentation Python/PuLP — Cahier mathématique complet
#
# Auteur    : Antigravity AI (code de référence)
# Version   : 2.0.0  (audit mathématique formel)
# Date      : 2026-09-21
#
# Architecture par niveaux (progression) :
#   Niveau 1 (L1) — Affectation seule (pas de routage)
#   Niveau 2 (L2) — L1 + capacités véhicules & usine
#   Niveau 3 (L3) — L2 + routage (y_{ijkt}) + MTZ (distance minimale)
#   Niveau 4 (L4) — L3 + fenêtres temporelles + pertes post-récolte (objectif complet)
#
# Validation : l'instance de référence (5 producteurs, 2 véhicules, 1 jour)
#              doit retrouver D=202 km (L3) et L≈2.166 t (L4).
# =============================================================================

import math
import logging
import time
from itertools import product as iproduct
from typing import Dict, List, Optional, Tuple

import pulp

from common.config import FACTORY_CAPACITY_DAILY_T

# ---------------------------------------------------------------------------
# Configuration du logger
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("SM10-Module1")


# =============================================================================
# 1.  DONNÉES RÉELLES
#     Source : cahier mathématique validé (SM10 Agro, Casamance)
# =============================================================================

# ---  Producteurs (P = {1..5}) ---
# Toutes les quantités sont en tonnes, toutes les distances en km.
PRODUCERS: List[int] = [1, 2, 3, 4, 5]

QUANTITY: Dict[int, float] = {
    # q_i : quantité disponible chez le producteur i (tonnes)
    # SOURCE : données réelles SM10
    1: 3.0,
    2: 2.0,
    3: 4.0,
    4: 1.0,
    5: 3.0,
}

DIST_TO_FACTORY: Dict[int, float] = {
    # d_{i,0} : distance entre le producteur i et l'usine (km)
    # SOURCE : données réelles SM10
    1: 20.0,
    2: 35.0,
    3: 15.0,
    4: 45.0,
    5: 30.0,
}

INTER_DIST_KNOWN: Dict[Tuple[int, int], float] = {
    # d_{ij} connus entre producteurs, symétriques (km)
    # SOURCE : données réelles SM10
    (3, 4): 40.0,
    (3, 5): 22.0,
    (4, 5): 35.0,
    (1, 2): 30.0,
}

# --- Véhicules (K = {1,2}) ---
VEHICLES: List[int] = [1, 2]

CAPACITY: Dict[int, float] = {
    # C_k : capacité du véhicule k (tonnes)
    # SOURCE : données réelles SM10
    1: 5.0,
    2: 8.0,
}

# --- Horizon temporel ---
DAYS: List[int] = [1]   # Instance de référence : 1 jour


# =============================================================================
# 2.  HYPOTHÈSES SIMULÉES
#     À remplacer dès que les données réelles SM10 Agro sont disponibles.
#     Chaque valeur est annotée HYPOTHÈSE SIMULÉE avec sa justification.
# =============================================================================

# HYPOTHÈSE SIMULÉE — Vitesse moyenne v = 40 km/h
#   Justification : pistes de Casamance, sols souvent non goudronnés.
#   À ajuster selon les données GPS réelles de terrain.
SPEED_KMH: float = 40.0

# HYPOTHÈSE SIMULÉE — Temps de service s_i = 0.5 h par producteur
#   Justification : temps de chargement et de pesée estimé à 30 min
#   par arrêt, indépendamment de la quantité (première approximation).
SERVICE_TIME_H: float = 0.5

# HYPOTHÈSE SIMULÉE — Capacité usine F_t ≈ 8 500 / 300 ≈ 28.3 t/jour
#   Justification : capacité annuelle déclarée de l'usine (8 500 t/an),
#   répartie sur 300 jours ouvrés. Alternative saisonnière possible :
#   8 500 t / 90 jours de saison de mangue ≈ 94 t/jour.
FACTORY_CAPACITY_PER_DAY: float = FACTORY_CAPACITY_DAILY_T  # t/jour — common/config.py

# HYPOTHÈSE SIMULÉE — Fenêtres temporelles [a_i, b_i]
#   Justification : en l'absence de données GPS/agenda des producteurs,
#   on suppose que chacun est disponible de 6 h à 14 h (journée de travail
#   agricole typique en Casamance).  Unité : heures depuis minuit.
TIME_WINDOWS: Dict[int, Tuple[float, float]] = {
    i: (6.0, 14.0) for i in PRODUCERS
}

# HYPOTHÈSE SIMULÉE — Taux de décroissance λ = 0.05 h⁻¹
#   Justification : estimation standard de perte post-récolte pour des
#   variétés de mangues locales (Kent, Keitt) à ~30 °C ambiant.
#   La perte est modélisée par L = q_i * (1 - exp(-λ·Δt_i)).
LAMBDA_LOSS: float = 0.05  # h⁻¹


# =============================================================================
# 3.  CONSTRUCTION DE LA MATRICE DE DISTANCES COMPLÈTE
#     Nœud 0 = usine ; nœuds 1..n = producteurs
# =============================================================================

def build_distance_matrix(
    producers: List[int],
    dist_to_factory: Dict[int, float],
    inter_dist_known: Dict[Tuple[int, int], float],
) -> Dict[Tuple[int, int], float]:
    """
    Construit la matrice symétrique d_{ij} pour i,j in N = {0} U P.

    Distances connues : d_{i,0} (usine-producteur) et certaines d_{i,j}
    inter-producteurs, issues de mesures terrain.

    Distances inconnues : en l'absence de mesure directe, la distance
    inter-producteurs inconnue est approximee par la longueur du detour
    via l'usine :
        d_hat_{ij} = d_{i,0} + d_{0,j}
    C'est une BORNE SUPERIEURE (inegalite triangulaire : d_{ij} <= d_{i,0} + d_{0,j}),
    utilisee comme approximation par defaut.

    HYPOTHESE SIMULEE : a remplacer des que les coordonnees GPS
    p_i = (latitude_i, longitude_i) seront disponibles.
    """
    n_nodes = [0] + producers
    dist: Dict[Tuple[int, int], float] = {}

    for i in n_nodes:
        dist[(i, i)] = 0.0

    # Distances usine <-> producteurs (symetriques, donnees reelles)
    for i in producers:
        dist[(0, i)] = dist_to_factory[i]
        dist[(i, 0)] = dist_to_factory[i]

    # Distances inter-producteurs connues (donnees reelles)
    for (i, j), d in inter_dist_known.items():
        dist[(i, j)] = d
        dist[(j, i)] = d

    # Distances inter-producteurs inconnues
    # HYPOTHESE SIMULEE : approximation par detour via l'usine
    #   d_hat_{ij} = d_{i,0} + d_{0,j}  (borne superieure)
    for i in producers:
        for j in producers:
            if i != j and (i, j) not in dist:
                est = dist_to_factory[i] + dist_to_factory[j]
                dist[(i, j)] = est
                dist[(j, i)] = est
                log.debug(
                    f"  d({i},{j}) approximee par detour via usine = {est:.1f} km "
                    f"(HYPOTHESE SIMULEE — borne superieure)"
                )

    return dist


# =============================================================================
# 4.  MODÈLE MILP — Niveau 3 (L3) : Routage avec distance minimale
#     Objectif : minimiser D = Σ d_{ij} · y_{ijkt}
#     Contraintes : affectation, capacités, cohérence, conservation,
#                   départ/retour usine, MTZ
# =============================================================================

def build_level3_model(
    producers: List[int],
    vehicles: List[int],
    days: List[int],
    quantity: Dict[int, float],
    capacity: Dict[int, float],
    factory_cap: float,
    dist: Dict[Tuple[int, int], float],
    eta: Optional[Dict[int, float]] = None,
    require_full_collection: bool = True,
) -> Tuple[pulp.LpProblem, Dict]:
    """
    Construit et retourne le modèle PuLP de niveau 3.

    Paramètres
    ----------
    eta : taux de collecte minimale η_i ∈ [0,1] (si None → collecte totale)
    require_full_collection : si True, Σ z_ikt = q_i (égalité stricte)

    Retourne
    --------
    (prob, vars_dict) où vars_dict contient x, y, z, w
    """
    P = producers
    K = vehicles
    T = days
    N = [0] + producers         # nœuds : 0 = usine
    n = len(P)

    # Big-M pour les contraintes de séquencement (non actif au L3)
    M_big = 1e6

    # -----------------------------------------------------------------------
    # Création du problème
    # -----------------------------------------------------------------------
    prob = pulp.LpProblem("SM10_Module1_L3_Routing", pulp.LpMinimize)

    # -----------------------------------------------------------------------
    # Variables de décision
    # -----------------------------------------------------------------------
    # x_{ikt} ∈ {0,1} : producteur i affecté au véhicule k le jour t
    x = {
        (i, k, t): pulp.LpVariable(f"x_{i}_{k}_{t}", cat="Binary")
        for i in P for k in K for t in T
    }

    # y_{ijkt} ∈ {0,1} : véhicule k va de i à j le jour t, i≠j, i,j ∈ N
    y = {
        (i, j, k, t): pulp.LpVariable(f"y_{i}_{j}_{k}_{t}", cat="Binary")
        for i in N for j in N for k in K for t in T
        if i != j
    }

    # z_{ikt} ≥ 0 : quantité collectée chez i par k au jour t
    z = {
        (i, k, t): pulp.LpVariable(f"z_{i}_{k}_{t}", lowBound=0)
        for i in P for k in K for t in T
    }

    # w_{ikt} >= 0 : position MTZ (elimination des sous-tours)
    # Indexe sur (i, k, t) pour permettre des tournees differentes
    # du meme vehicule sur des jours distincts (preparation multi-jours).
    w = {
        (i, k, t): pulp.LpVariable(f"w_{i}_{k}_{t}", lowBound=0, upBound=n)
        for i in P for k in K for t in T
    }

    # -----------------------------------------------------------------------
    # Fonction objectif — Niveau 3 : minimiser la distance totale
    # -----------------------------------------------------------------------
    prob += pulp.lpSum(
        dist[(i, j)] * y[(i, j, k, t)]
        for (i, j, k, t) in y
    ), "Distance_totale"

    # -----------------------------------------------------------------------
    # Contrainte 1 : Affectation (chaque producteur au plus une fois)
    #   Sum_{k,t} x_{ikt} <= 1
    #
    # PREUVE que Sum_{k,t} x_{ikt} = 1 en collecte totale :
    #   C2 : z_{ikt} <= q_i * x_{ikt}  =>  si tous x_{ikt}=0, alors z=0
    #   C3 : Sum_{k,t} z_{ikt} = q_i > 0  =>  au moins un x_{ikt}=1
    #   C1 : Sum <= 1 + au moins un = 1  =>  Sum = 1 exactement.
    # -----------------------------------------------------------------------
    for i in P:
        prob += (
            pulp.lpSum(x[(i, k, t)] for k in K for t in T) <= 1,
            f"Affectation_{i}",
        )

    # -----------------------------------------------------------------------
    # Contrainte 2 : Lien quantité–affectation  z_{ikt} ≤ q_i · x_{ikt}
    # -----------------------------------------------------------------------
    for i in P:
        for k in K:
            for t in T:
                prob += (
                    z[(i, k, t)] <= quantity[i] * x[(i, k, t)],
                    f"LienQteAff_{i}_{k}_{t}",
                )

    # -----------------------------------------------------------------------
    # Contrainte 3 : Collecte totale ou partielle
    # -----------------------------------------------------------------------
    for i in P:
        total_collected = pulp.lpSum(z[(i, k, t)] for k in K for t in T)
        if require_full_collection:
            prob += (total_collected == quantity[i], f"CollecteTotale_{i}")
        else:
            rate = eta[i] if (eta and i in eta) else 0.0
            prob += (
                total_collected >= rate * quantity[i],
                f"CollecteMin_{i}",
            )

    # -----------------------------------------------------------------------
    # Contrainte 4 : Capacité des véhicules
    # -----------------------------------------------------------------------
    for k in K:
        for t in T:
            prob += (
                pulp.lpSum(z[(i, k, t)] for i in P) <= capacity[k],
                f"CapVehicule_{k}_{t}",
            )

    # -----------------------------------------------------------------------
    # Contrainte 5 : Capacité de l'usine
    # -----------------------------------------------------------------------
    for t in T:
        prob += (
            pulp.lpSum(z[(i, k, t)] for i in P for k in K) <= factory_cap,
            f"CapUsine_{t}",
        )

    # -----------------------------------------------------------------------
    # Contrainte 6 : Cohérence affectation–routage
    #   Σ_{j≠i} y_{ijkt} = x_{ikt}  (sortie de i)
    #   Σ_{j≠i} y_{jikt} = x_{ikt}  (entrée en i)
    # -----------------------------------------------------------------------
    for i in P:
        for k in K:
            for t in T:
                # Sortie de i
                prob += (
                    pulp.lpSum(y[(i, j, k, t)] for j in N if j != i) == x[(i, k, t)],
                    f"CoherenceSortie_{i}_{k}_{t}",
                )
                # Entrée en i
                prob += (
                    pulp.lpSum(y[(j, i, k, t)] for j in N if j != i) == x[(i, k, t)],
                    f"CoherenceEntree_{i}_{k}_{t}",
                )

    # -----------------------------------------------------------------------
    # Contrainte 7 : Conservation du flux (redondante mais utile au solveur)
    # -----------------------------------------------------------------------
    # Déjà implicite via la contrainte 6 ; on ne la réécrit pas séparément.

    # -----------------------------------------------------------------------
    # Contrainte 8 : Départ et retour usine (au plus 1 tournée/véhicule/jour)
    # -----------------------------------------------------------------------
    for k in K:
        for t in T:
            prob += (
                pulp.lpSum(y[(0, j, k, t)] for j in P) <= 1,
                f"DepartUsine_{k}_{t}",
            )
            prob += (
                pulp.lpSum(y[(i, 0, k, t)] for i in P) <= 1,
                f"RetourUsine_{k}_{t}",
            )

    # -----------------------------------------------------------------------
    # Contrainte 9 : Elimination des sous-tours (MTZ)
    #   w_{ikt} - w_{jkt} + n * y_{ijkt} <= n-1   pour tout i,j in P, i!=j, k, t
    #
    #   w indexe sur (i,k,t) pour ne pas coupler artificiellement
    #   les tournees du meme vehicule entre jours distincts.
    # -----------------------------------------------------------------------
    for i in P:
        for j in P:
            if i != j:
                for k in K:
                    for t in T:
                        prob += (
                            w[(i, k, t)] - w[(j, k, t)] + n * y[(i, j, k, t)] <= n - 1,
                            f"MTZ_{i}_{j}_{k}_{t}",
                        )

    return prob, {"x": x, "y": y, "z": z, "w": w}


# =============================================================================
# 5.  MODÈLE MILP — Niveau 4 (L4) : Fenêtres temporelles + pertes
#     Objectif lexicographique : L ≻ T_route ≻ D
#     (implémenté comme minimisation ε-contrainte ou séquentielle)
# =============================================================================

def build_level4_model(
    producers: List[int],
    vehicles: List[int],
    days: List[int],
    quantity: Dict[int, float],
    capacity: Dict[int, float],
    factory_cap: float,
    dist: Dict[Tuple[int, int], float],
    speed_kmh: float,
    service_time_h: float,
    time_windows: Dict[int, Tuple[float, float]],
    lambda_loss: float,
    require_full_collection: bool = True,
) -> Tuple[pulp.LpProblem, Dict]:
    """
    Construit le modele complet de Niveau 4.

    L'optimisation lexicographique L > T_route > D est APPROCHEE par une
    ponderation normalisee avec coefficients fortement contrastes :
        min  alpha * L_norm + beta * T_norm + gamma * D_norm
    avec alpha >> beta >> gamma.

    Pour une optimisation lexicographique EXACTE en 3 passes sequentielles,
    utiliser solve_lexicographic() apres construction du modele.
    """
    P = producers
    K = vehicles
    T = days
    N = [0] + producers
    n = len(P)

    # Vitesse de trajet -> temps (h) = distance (km) / vitesse (km/h)
    tau: Dict[Tuple[int, int], float] = {
        (i, j): dist[(i, j)] / speed_kmh for (i, j) in dist if i != j
    }

    # -------------------------------------------------------------------
    # Big-M : bornes justifiees plutot qu'un M=24 arbitraire
    # -------------------------------------------------------------------
    # M_global : borne superieure de toute variable temporelle (horizon 24h)
    #   Utilise pour les bornes de variables et les contraintes McCormick.
    M_global = 24.0

    # M_seq[(i,j)] : Big-M specifique pour la contrainte de sequencement C10
    #   sur l'arc (i,j). On calcule le M minimum qui garantit que la
    #   contrainte est toujours satisfaite quand y_{ijkt} = 0.
    #
    # Derivation pour C10a (borne inf) :
    #   u_j >= u_i + s_i + tau_ij - M_ij * (1 - y_ij)
    #   Quand y_ij = 0 : il faut M_ij >= u_i - u_j + s_i + tau_ij
    #   Puisque u_j peut valoir 0 (si non visite), min(u_j) = 0.
    #   Max(u_i) = b_i. Donc M_ij >= b_i + s_i + tau_ij
    #
    # Derivation pour C10b (borne sup) :
    #   u_j <= u_i + s_i + tau_ij + M_ij * (1 - y_ij)
    #   Quand y_ij = 0 : il faut M_ij >= u_j - u_i - s_i - tau_ij
    #   Min(u_i) = 0 (si non visite). Max(u_j) = b_j.
    #   Donc M_ij >= b_j - s_i - tau_ij
    #
    # On prend le max des deux pour couvrir toutes les combinaisons.
    M_seq: Dict[Tuple[int, int], float] = {}
    for i in N:
        for j in P:
            if i != j:
                if i == 0:
                    # Depot : u0 in [0, DEPOT_OPEN_H] (6.0 h)
                    # M_global en fallback par securite
                    b_i_val = 6.0
                    s_i_val = 0.0
                else:
                    _, b_i_val = time_windows[i]
                    s_i_val = service_time_h
                _, b_j_val = time_windows[j]
                tau_ij = tau.get((i, j), 0.0)
                m_lb = b_i_val + s_i_val + tau_ij - 0.0  # pour C10a
                m_ub = b_j_val - 0.0 - s_i_val - tau_ij  # pour C10b
                M_seq[(i, j)] = max(m_lb, m_ub, 0.0)

    # M_ret[i] : Big-M specifique pour C11 (retour usine depuis producteur i)
    M_ret: Dict[int, float] = {}
    for i in P:
        _, b_i_val = time_windows[i]
        tau_i0 = tau.get((i, 0), 0.0)
        # C11a : u_ret >= u_i + s_i + tau_i0 - M_ret_i * (1-y)
        #   u_ret_min = 0, u_i_max = b_i
        m_lb = b_i_val + service_time_h + tau_i0 - 0.0
        # C11b : u_ret <= u_i + s_i + tau_i0 + M_ret_i * (1-y)
        #   u_ret_max = M_global, u_i_min = 0
        m_ub = M_global - 0.0 - service_time_h - tau_i0
        M_ret[i] = max(m_lb, m_ub, 0.0)

    log.debug(f"Big-M specifiques : M_seq min={min(M_seq.values()):.2f}, "
              f"max={max(M_seq.values()):.2f}, "
              f"M_ret min={min(M_ret.values()):.2f}, max={max(M_ret.values()):.2f}")

    prob = pulp.LpProblem("SM10_Module1_L4_Full", pulp.LpMinimize)

    # -----------------------------------------------------------------------
    # Variables
    # -----------------------------------------------------------------------
    x = {
        (i, k, t): pulp.LpVariable(f"x_{i}_{k}_{t}", cat="Binary")
        for i in P for k in K for t in T
    }
    y = {
        (i, j, k, t): pulp.LpVariable(f"y_{i}_{j}_{k}_{t}", cat="Binary")
        for i in N for j in N for k in K for t in T if i != j
    }
    z = {
        (i, k, t): pulp.LpVariable(f"z_{i}_{k}_{t}", lowBound=0)
        for i in P for k in K for t in T
    }
    # u_{ikt} : heure d'ARRIVEE au producteur i par le vehicule k au jour t (h)
    #   Interpretation :
    #     u_{ikt}         = heure d'arrivee chez i
    #     u_{ikt} + s_i   = heure de fin de service (chargement termine)
    #   Coherent avec C10 : u_j = u_i + s_i + tau_{ij}
    #     => arrivee en j = depart de i (apres service) + temps de trajet
    u = {
        (i, k, t): pulp.LpVariable(f"u_{i}_{k}_{t}", lowBound=0, upBound=M_global)
        for i in P for k in K for t in T
    }
    # u_{0kt} : heure de depart de l'usine par le vehicule k au jour t
    u0 = {
        (k, t): pulp.LpVariable(f"u0_{k}_{t}", lowBound=0, upBound=M_global)
        for k in K for t in T
    }
    # w_{ikt} : position MTZ (indexe sur t pour multi-jours)
    w = {
        (i, k, t): pulp.LpVariable(f"w_{i}_{k}_{t}", lowBound=0, upBound=n)
        for i in P for k in K for t in T
    }
    # u_ret[k,t] : instant de retour du véhicule k à l'usine au jour t (heures)
    # C'est la variable temporelle du DERNIER arc (i→0) de la tournée.
    # Définition du cahier (étape 19) : Δt_i = u_ret[k,t] - a_i
    u_ret = {
        (k, t): pulp.LpVariable(f"u_ret_{k}_{t}", lowBound=0, upBound=M_global)
        for k in K for t in T
    }
    # u_ret_i[i,k,t] : variable auxiliaire de linéarisation (McCormick)
    #   Représente u_ret[k,t] · x[i,k,t]  (produit bi-linéaire → MILP linéaire)
    #   Inégalités : 0 ≤ u_ret_i ≤ M·x  et  u_ret_i ≥ u_ret - M·(1-x)
    u_ret_i = {
        (i, k, t): pulp.LpVariable(f"u_ret_i_{i}_{k}_{t}", lowBound=0, upBound=M_global)
        for i in P for k in K for t in T
    }

    # -----------------------------------------------------------------------
    # Expressions linéarisées des trois critères
    # -----------------------------------------------------------------------
    # D (km)
    expr_D = pulp.lpSum(
        dist[(i, j)] * y[(i, j, k, t)]
        for (i, j, k, t) in y
    )
    # T_route (h)
    expr_T = pulp.lpSum(
        tau[(i, j)] * y[(i, j, k, t)]
        for (i, j, k, t) in y
    )
    # ===================================================================
    # MODELE DE PERTE POST-RECOLTE
    # ===================================================================
    #
    # Hypothese physique :
    #   La mangue du producteur i est recoltee a t = a_i (ouverture de
    #   la fenetre temporelle) et commence a se degrader immediatement.
    #   La degradation suit une cinetique exponentielle de premier ordre.
    #
    # Variable modelisee :
    #   Delta_t_i = u_ret[k,t] - a_i
    #       = (retour usine du vehicule k) - (debut du vieillissement)
    #
    # DISTINCTION L_objectif vs L_evaluation :
    #   L_objectif  = lambda * Sum_i q_i * Delta_t_i    (linearisation 1er ordre)
    #   L_evaluation = Sum_i q_i * (1 - exp(-lambda * Delta_t_i))  (exacte, post-traitement)
    #
    # Validite de la linearisation :
    #   Pour lambda*Delta_t <= 0.3, l'erreur relative est < 5%.
    #   Instance de reference : lambda*Delta_t_max = 0.05 * 4.425 = 0.221 -> erreur ~2.4%.
    #
    # Linearisation via McCormick :
    #   u_ret_i[i,k,t] represente u_ret[k,t] * x[i,k,t] (voir C12).
    #
    # HYPOTHESE SIMULEE — linearisation de la perte post-recolte (lambda*Delta_t << 1)
    # ===================================================================
    expr_L_simple = lambda_loss * pulp.lpSum(
        quantity[i] * u_ret_i[(i, k, t)]
        for i in P for k in K for t in T
    ) - lambda_loss * pulp.lpSum(
        quantity[i] * time_windows[i][0] * x[(i, k, t)]
        for i in P for k in K for t in T
    )

    # Pondération fortement contrastée (approximation de l'ordre lexicographique)
    # Valeurs de référence approximatives :
    #   D_max ≈ 300 km, T_max ≈ 8 h, L_max ≈ 13 t (=Σq_i)
    D_ref, T_ref, L_ref = 300.0, 8.0, 13.0
    alpha = 1e6     # poids L (pertes) — priorité absolue
    beta  = 1e3     # poids T_route   — priorité secondaire
    gamma = 1.0     # poids D         — priorité tertiaire

    prob += (
        alpha * (expr_L_simple / L_ref)
        + beta  * (expr_T / T_ref)
        + gamma * (expr_D / D_ref)
    ), "Objectif_lexicographique_approx"

    # -----------------------------------------------------------------------
    # Contraintes (identiques L3 + fenêtres temporelles + séquencement)
    # -----------------------------------------------------------------------

    # C1 : Affectation
    for i in P:
        prob += (
            pulp.lpSum(x[(i, k, t)] for k in K for t in T) <= 1,
            f"Affectation_{i}",
        )

    # C2 : Lien quantité–affectation
    for i in P:
        for k in K:
            for t in T:
                prob += (z[(i, k, t)] <= quantity[i] * x[(i, k, t)], f"LienQteAff_{i}_{k}_{t}")

    # C3 : Collecte totale
    for i in P:
        if require_full_collection:
            prob += (
                pulp.lpSum(z[(i, k, t)] for k in K for t in T) == quantity[i],
                f"CollecteTotale_{i}",
            )

    # C4 : Capacité véhicules
    for k in K:
        for t in T:
            prob += (
                pulp.lpSum(z[(i, k, t)] for i in P) <= capacity[k],
                f"CapVehicule_{k}_{t}",
            )

    # C5 : Capacité usine
    for t in T:
        prob += (
            pulp.lpSum(z[(i, k, t)] for i in P for k in K) <= factory_cap,
            f"CapUsine_{t}",
        )

    # C6 : Cohérence affectation–routage
    for i in P:
        for k in K:
            for t in T:
                prob += (
                    pulp.lpSum(y[(i, j, k, t)] for j in N if j != i) == x[(i, k, t)],
                    f"CoherenceSortie_{i}_{k}_{t}",
                )
                prob += (
                    pulp.lpSum(y[(j, i, k, t)] for j in N if j != i) == x[(i, k, t)],
                    f"CoherenceEntree_{i}_{k}_{t}",
                )

    # C7 : Départ/retour usine
    for k in K:
        for t in T:
            prob += (pulp.lpSum(y[(0, j, k, t)] for j in P) <= 1, f"DepartUsine_{k}_{t}")
            prob += (pulp.lpSum(y[(i, 0, k, t)] for i in P) <= 1, f"RetourUsine_{k}_{t}")

    # C8 : MTZ (w indexe sur (i,k,t) pour multi-jours)
    for i in P:
        for j in P:
            if i != j:
                for k in K:
                    for t in T:
                        prob += (
                            w[(i, k, t)] - w[(j, k, t)] + n * y[(i, j, k, t)] <= n - 1,
                            f"MTZ_{i}_{j}_{k}_{t}",
                        )

    # C9 : Fenêtres temporelles  a_i · x_{ikt} ≤ u_{ikt} ≤ b_i · x_{ikt}
    for i in P:
        a_i, b_i = time_windows[i]
        for k in K:
            for t in T:
                prob += (u[(i, k, t)] >= a_i * x[(i, k, t)], f"TW_lower_{i}_{k}_{t}")
                prob += (u[(i, k, t)] <= b_i * x[(i, k, t)], f"TW_upper_{i}_{k}_{t}")

    # C10 : Sequencement temporel — BORNE INFERIEURE ET SUPERIEURE
    #   C10a : u_{jkt} >= u_{ikt} + s_i + tau_{ij} - M_seq[(i,j)] * (1 - y_{ijkt})
    #   C10b : u_{jkt} <= u_{ikt} + s_i + tau_{ij} + M_seq[(i,j)] * (1 - y_{ijkt})
    #
    #   Les deux bornes ensemble forcent :
    #       u_{jkt} = u_{ikt} + s_i + tau_{ij}  quand y_{ijkt} = 1
    #
    #   M_seq[(i,j)] est le Big-M SPECIFIQUE a l'arc (i,j), calcule a partir
    #   des bornes des fenetres temporelles (voir derivation ci-dessus).
    for i in N:
        for j in P:
            if i != j:
                for k in K:
                    for t in T:
                        key_y = (i, j, k, t)
                        if key_y not in y:
                            continue
                        if i == 0:
                            u_i = u0[(k, t)]
                            s_i = 0.0    # pas de service a l'usine
                        else:
                            u_i = u[(i, k, t)]
                            s_i = service_time_h
                        m_ij = M_seq[(i, j)]
                        # C10a : borne inferieure
                        prob += (
                            u[(j, k, t)] >= u_i + s_i + tau[(i, j)]
                            - m_ij * (1 - y[key_y]),
                            f"SeqLB_{i}_{j}_{k}_{t}",
                        )
                        # C10b : borne superieure (force l'egalite)
                        prob += (
                            u[(j, k, t)] <= u_i + s_i + tau[(i, j)]
                            + m_ij * (1 - y[key_y]),
                            f"SeqUB_{i}_{j}_{k}_{t}",
                        )

    # Départ de l'usine : u0[k,t] = DEPOT_OPEN_H quand le véhicule k est actif
    # HYPOTHÈSE SIMULÉE — heure de départ des véhicules = 6 h du matin
    DEPOT_OPEN_H = 6.0  # heure d'ouverture du dépôt
    for k in K:
        for t in T:
            # Si le véhicule part (∃ arc 0→j actif), u0 = DEPOT_OPEN_H
            depart_arc = pulp.lpSum(y[(0, j, k, t)] for j in P)
            # Borne inférieure : u0 ≥ DEPOT_OPEN_H si véhicule actif
            prob += (u0[(k, t)] >= DEPOT_OPEN_H * depart_arc, f"DepotDepartLB_{k}_{t}")
            # Borne supérieure : u0 ≤ DEPOT_OPEN_H + M·(1 - depart_arc)
            # (si pas actif, u0 peut être 0 ; si actif, u0 ≤ DEPOT_OPEN_H)
            prob += (u0[(k, t)] <= DEPOT_OPEN_H + M_global * (1 - depart_arc), f"DepotDepartUB_{k}_{t}")

    # C11 : Sequencement du retour a l'usine — BORNE INFERIEURE ET SUPERIEURE
    #   C11a : u_ret[k,t] >= u[i,k,t] + s_i + tau[i,0] - M_ret[i] * (1 - y[i,0,k,t])
    #   C11b : u_ret[k,t] <= u[i,k,t] + s_i + tau[i,0] + M_ret[i] * (1 - y[i,0,k,t])
    #   M_ret[i] est le Big-M SPECIFIQUE au producteur i (voir derivation ci-dessus).
    #
    #   Quand y[i,0,k,t] = 1 : u_ret = u_i + s_i + tau_i0  (egalite forcee).
    #   Quand y[i,0,k,t] = 0 : Big-M neutralise la contrainte.
    for i in P:
        for k in K:
            for t in T:
                key_y = (i, 0, k, t)
                if key_y in y:
                    m_i = M_ret[i]
                    # C11a : borne inferieure
                    prob += (
                        u_ret[(k, t)] >= u[(i, k, t)] + service_time_h + tau[(i, 0)]
                        - m_i * (1 - y[key_y]),
                        f"RetourUsineSeqLB_{i}_{k}_{t}",
                    )
                    # C11b : borne superieure (force l'egalite)
                    prob += (
                        u_ret[(k, t)] <= u[(i, k, t)] + service_time_h + tau[(i, 0)]
                        + m_i * (1 - y[key_y]),
                        f"RetourUsineSeqUB_{i}_{k}_{t}",
                    )

    # Borne : si le véhicule k ne part pas, u_ret = 0
    for k in K:
        for t in T:
            active_k = pulp.lpSum(x[(i, k, t)] for i in P)
            prob += (u_ret[(k, t)] <= M_global * active_k, f"RetourUsineActif_{k}_{t}")

    # C12 : Linearisation de McCormick pour u_ret_i[i,k,t] = u_ret[k,t] * x[i,k,t]
    #
    # PREUVE FORMELLE :
    #   Cas x = 0 :
    #     (b) u_ret_i <= M * 0 = 0
    #     (a) u_ret_i >= 0         (borne de la variable)
    #     Donc u_ret_i = 0 = u_ret * 0  CQFD
    #
    #   Cas x = 1 :
    #     (c) u_ret_i >= u_ret - M*(1-1) = u_ret
    #     (d) u_ret_i <= u_ret
    #     Donc u_ret_i = u_ret = u_ret * 1  CQFD
    #
    # Pour x in {0,1}, les inegalites (b)+(c)+(d) forcent u_ret_i = u_ret * x.
    for i in P:
        for k in K:
            for t in T:
                xi = x[(i, k, t)]
                ur = u_ret[(k, t)]
                uri = u_ret_i[(i, k, t)]
                # (b) nul si non affecte
                prob += (uri <= M_global * xi,              f"McC_upper_x_{i}_{k}_{t}")
                # (c) egal a u_ret si affecte
                prob += (uri >= ur - M_global * (1 - xi),   f"McC_lower_u_{i}_{k}_{t}")
                # (d) ne depasse pas u_ret
                prob += (uri <= ur,                        f"McC_upper_u_{i}_{k}_{t}")

    return prob, {
        "x": x, "y": y, "z": z, "u": u, "u0": u0, "w": w,
        "u_ret": u_ret, "u_ret_i": u_ret_i,
        "expr_L": expr_L_simple,
        "expr_T": expr_T,
        "expr_D": expr_D
    }


# =============================================================================
# 6.  SOLVEUR & EXTRACTION DES RÉSULTATS
# =============================================================================

def solve_lexicographic(
    prob: pulp.LpProblem,
    vars_dict: Dict,
    producers: List[int],
    vehicles: List[int],
    days: List[int],
    dist: Dict[Tuple[int, int], float],
    quantity: Dict[int, float],
    time_limit_s: int = 120,
    gap_tol: float = 0.01,
) -> Optional[Dict]:
    """
    Optimisation lexicographique exacte en 3 passes :
      Etape 1 : min L          -> L*
      Etape 2 : min T  s.c. L <= L* + eps_L  -> T*
      Etape 3 : min D  s.c. L <= L* + eps_L, T <= T* + eps_T  -> D*
    """
    expr_L = vars_dict["expr_L"]
    expr_T = vars_dict["expr_T"]
    expr_D = vars_dict["expr_D"]

    solver = pulp.PULP_CBC_CMD(
        msg=0,
        timeLimit=time_limit_s,
        gapRel=gap_tol,
        options=["presolve on", "cuts on"],
    )

    # Tolerances absolues (a ajuster selon l'echelle)
    eps_L = 0.01  # t
    eps_T = 0.1   # h

    # Etape 1 : min L
    log.info("Lexicographique Etape 1/3 : min L (pertes)...")
    prob.objective = expr_L
    status_1 = prob.solve(solver)
    if status_1 != 1:
        log.warning("Etape 1 infaisable ou non optimale.")
        return None
    L_star = pulp.value(expr_L)
    log.info(f"  -> L* = {L_star:.4f}")

    # Etape 2 : min T
    log.info("Lexicographique Etape 2/3 : min T (temps)...")
    prob += (expr_L <= L_star + eps_L, "Lexico_Bound_L")
    prob.objective = expr_T
    status_2 = prob.solve(solver)
    if status_2 != 1:
        log.warning("Etape 2 infaisable ou non optimale.")
        return None
    T_star = pulp.value(expr_T)
    log.info(f"  -> T* = {T_star:.4f}")

    # Etape 3 : min D
    log.info("Lexicographique Etape 3/3 : min D (distance)...")
    prob += (expr_T <= T_star + eps_T, "Lexico_Bound_T")
    prob.objective = expr_D
    
    # Pour l'etape finale, on utilise solver par defaut avec logs
    solver_final = pulp.PULP_CBC_CMD(
        msg=1,
        timeLimit=time_limit_s,
        gapRel=gap_tol,
        options=["presolve on", "cuts on"],
    )
    t_start = time.time()
    status_3 = prob.solve(solver_final)
    elapsed = time.time() - t_start
    
    if status_3 != 1:
        log.warning("Etape 3 infaisable ou non optimale.")
        return None
    
    D_star = pulp.value(expr_D)
    log.info(f"  -> D* = {D_star:.4f}")
    
    # Extraction via extract_results (refactore)
    return extract_results(prob, vars_dict, producers, vehicles, days, dist, quantity, elapsed, status_3)


def extract_results(
    prob: pulp.LpProblem,
    vars_dict: Dict,
    producers: List[int],
    vehicles: List[int],
    days: List[int],
    dist: Dict[Tuple[int, int], float],
    quantity: Dict[int, float],
    elapsed: float,
    status: int,
) -> Optional[Dict]:
    """
    Extrait les resultats cles du modele resolu.
    """
    log.info(f"Statut solveur : {pulp.LpStatus[status]}  ({elapsed:.1f}s)")

    if status != 1:
        log.warning(f"Solution non optimale ou infaisable : {pulp.LpStatus.get(status, status)}")
        return None

    P, K, T, N = producers, vehicles, days, [0] + producers

    # --- Affectations ---
    assignment: Dict[int, Tuple[int, int]] = {}  # i → (k, t)
    for i in P:
        for k in K:
            for t in T:
                if pulp.value(vars_dict["x"][(i, k, t)]) > 0.5:
                    assignment[i] = (k, t)

    # --- Quantités collectées ---
    collected: Dict[Tuple[int, int, int], float] = {}
    for i in P:
        for k in K:
            for t in T:
                v = pulp.value(vars_dict["z"][(i, k, t)])
                if v and v > 1e-6:
                    collected[(i, k, t)] = round(v, 4)

    # --- Arcs actifs (routage) ---
    arcs: Dict[int, List[Tuple[int, int]]] = {k: [] for k in K}
    for (i, j, k, t) in vars_dict["y"]:
        if pulp.value(vars_dict["y"][(i, j, k, t)]) > 0.5:
            arcs[k].append((i, j))

    # --- Reconstruction des tournées ---
    def reconstruct_tour(arcs_k: List[Tuple[int, int]]) -> List[int]:
        """Reconstruit la séquence de nœuds à partir des arcs."""
        next_node: Dict[int, int] = {i: j for (i, j) in arcs_k}
        if 0 not in next_node:
            return []
        tour = [0]
        current = next_node.get(0)
        max_iter = len(arcs_k) + 2
        it = 0
        while current is not None and current != 0 and it < max_iter:
            tour.append(current)
            current = next_node.get(current)
            it += 1
        tour.append(0)
        return tour

    tours: Dict[int, List[int]] = {}
    tour_dist: Dict[int, float] = {}
    for k in K:
        tours[k] = reconstruct_tour(arcs[k])
        tour_dist[k] = sum(
            dist[(tours[k][s], tours[k][s + 1])]
            for s in range(len(tours[k]) - 1)
            if len(tours[k]) > 1
        )

    total_dist = sum(tour_dist.values())

    # --- Instants de collecte (L4 seulement) ---
    timing: Dict[Tuple[int, int, int], float] = {}
    if "u" in vars_dict:
        for i in P:
            for k in K:
                for t in T:
                    v = pulp.value(vars_dict["u"][(i, k, t)])
                    if v and v > 1e-6:
                        timing[(i, k, t)] = round(v, 3)

    # --- Temps de retour à l'usine par véhicule (L4 seulement) ---
    return_time: Dict[Tuple[int, int], float] = {}
    if "u_ret" in vars_dict:
        for k in K:
            for t in T:
                v = pulp.value(vars_dict["u_ret"][(k, t)])
                if v is not None:
                    return_time[(k, t)] = round(v, 3)

    results = {
        "status": pulp.LpStatus[status],
        "objective": pulp.value(prob.objective),
        "assignment": assignment,
        "collected": collected,
        "arcs": arcs,
        "tours": tours,
        "tour_dist": tour_dist,
        "total_dist": total_dist,
        "timing": timing,
        "return_time": return_time,
        "elapsed_s": round(elapsed, 2),
    }
    return results


def solve_and_extract(
    prob: pulp.LpProblem,
    vars_dict: Dict,
    producers: List[int],
    vehicles: List[int],
    days: List[int],
    dist: Dict[Tuple[int, int], float],
    quantity: Dict[int, float],
    time_limit_s: int = 120,
    gap_tol: float = 0.01,
) -> Optional[Dict]:
    """
    Résout le problème PuLP et extrait les résultats clés.
    """
    solver = pulp.PULP_CBC_CMD(
        msg=1,
        timeLimit=time_limit_s,
        gapRel=gap_tol,
        options=["presolve on", "cuts on"],
    )
    t_start = time.time()
    status = prob.solve(solver)
    elapsed = time.time() - t_start

    return extract_results(
        prob, vars_dict, producers, vehicles, days, dist, quantity, elapsed, status
    )



# =============================================================================
# 7.  AFFICHAGE & VALIDATION
# =============================================================================

SEPARATOR = "=" * 65

def print_results(results: Dict, level: str = "L3"):
    """Affiche les résultats de façon structurée."""
    if results is None:
        log.error("Pas de résultats à afficher (solution infaisable?).")
        return

    print(f"\n{SEPARATOR}")
    print(f"  RÉSULTATS — {level}")
    print(SEPARATOR)
    print(f"  Statut     : {results['status']}")
    print(f"  Objectif   : {results['objective']:.4f}")
    print(f"  Temps CPU  : {results['elapsed_s']} s")
    print()

    # Tournées
    for k, tour in results["tours"].items():
        if len(tour) > 2:
            tour_str = " -> ".join(
                f"Usine" if n == 0 else f"P{n}" for n in tour
            )
            print(f"  Véhicule V{k} : {tour_str}  [{results['tour_dist'][k]:.1f} km]")
        else:
            print(f"  Véhicule V{k} : (pas de tournée)")

    print(f"\n  Distance totale : {results['total_dist']:.1f} km")

    # Affectations et quantités
    print("\n  Affectations & quantités collectées :")
    for i, (k, t) in sorted(results["assignment"].items()):
        q_val = results["collected"].get((i, k, t), 0.0)
        t_val = results["timing"].get((i, k, t), None)
        t_str = f"  (arrivée {t_val:.2f} h)" if t_val else ""
        print(f"    P{i} → V{k} jour {t}  | {q_val:.2f} t{t_str}")

    # Heures d'arrivee (L4)
    if results["timing"]:
        print()
        print("  Heures d'arrivee chez les producteurs (h) :")
        for (i, k, t), u_val in sorted(results["timing"].items()):
            print(f"    u({i},{k},{t}) = {u_val:.3f} h")


def validate_reference(results: Dict, level: str = "L3") -> bool:
    """
    Valide les résultats contre les valeurs de référence du cahier.
    Retourne True si la validation est réussie.
    """
    REFERENCE = {
        "L3": {
            "total_dist": 202.0,
            "tour_V1": [0, 1, 2, 0],   # ou permutation équivalente
            "tour_V2": [0, 3, 5, 4, 0],
            "tour_dist_V1": 85.0,
            "tour_dist_V2": 117.0,
        },
        "L4": {
            "total_loss_t": 2.166,
        },
    }
    ref = REFERENCE.get(level, {})
    ok = True
    tol = 1.0  # tolérance km

    print(f"\n{SEPARATOR}")
    print(f"  VALIDATION vs RÉFÉRENCE — {level}")
    print(SEPARATOR)

    if level == "L3" and "total_dist" in ref:
        d = results["total_dist"]
        expected = ref["total_dist"]
        passed = abs(d - expected) <= tol
        status_str = "✅ OK" if passed else f"❌ ÉCART ({d:.1f} ≠ {expected})"
        print(f"  Distance totale : {d:.1f} km  {status_str}")
        ok = ok and passed

        # Vérification des tournées par véhicule
        for k in [1, 2]:
            tour_key = f"tour_dist_V{k}"
            if tour_key in ref:
                td = results["tour_dist"].get(k, 0.0)
                exp_td = ref[tour_key]
                p = abs(td - exp_td) <= tol
                s = "✅ OK" if p else f"❌ ÉCART ({td:.1f} ≠ {exp_td})"
                print(f"  V{k} distance    : {td:.1f} km  {s}")
                ok = ok and p

    print(f"\n  Résultat global : {'✅ VALIDATION RÉUSSIE' if ok else '❌ VALIDATION ÉCHOUÉE'}")
    return ok


# =============================================================================
# 8.  POINT D'ENTRÉE PRINCIPAL
# =============================================================================

def main():
    print(SEPARATOR)
    print("  SM10 — Module 1 : Tournées de collecte de mangues")
    print("  Casamance, Sénégal — Validation instance de référence")
    print(SEPARATOR)

    # --- Construction de la matrice de distances ---
    dist = build_distance_matrix(PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN)
    log.info("Matrice de distances construite.")

    # Affichage de la matrice (nœuds 0..5)
    print("\n  Matrice de distances [km] :")
    print("       0    1    2    3    4    5")
    for i in [0] + PRODUCERS:
        row = f"  {i:>2}  "
        for j in [0] + PRODUCERS:
            d = dist.get((i, j), 0.0)
            row += f"{d:>5.0f}"
        print(row)

    # =========================================================================
    #  NIVEAU 3 — Routage, objectif = distance minimale
    # =========================================================================
    print(f"\n{SEPARATOR}")
    print("  NIVEAU 3 — Routage (minimiser distance totale)")
    print(SEPARATOR)

    prob_l3, vars_l3 = build_level3_model(
        producers=PRODUCERS,
        vehicles=VEHICLES,
        days=DAYS,
        quantity=QUANTITY,
        capacity=CAPACITY,
        factory_cap=FACTORY_CAPACITY_PER_DAY,
        dist=dist,
        require_full_collection=True,
    )

    results_l3 = solve_and_extract(
        prob=prob_l3,
        vars_dict=vars_l3,
        producers=PRODUCERS,
        vehicles=VEHICLES,
        days=DAYS,
        dist=dist,
        quantity=QUANTITY,
        time_limit_s=180,
        gap_tol=0.005,
    )

    print_results(results_l3, level="L3")
    l3_ok = validate_reference(results_l3, level="L3")

    # =========================================================================
    #  NIVEAU 4 — Fenêtres temporelles + pertes post-récolte
    # =========================================================================
    print(f"\n{SEPARATOR}")
    print("  NIVEAU 4 — Objectif complet (pertes ≻ temps ≻ distance)")
    print(SEPARATOR)

    prob_l4, vars_l4 = build_level4_model(
        producers=PRODUCERS,
        vehicles=VEHICLES,
        days=DAYS,
        quantity=QUANTITY,
        capacity=CAPACITY,
        factory_cap=FACTORY_CAPACITY_PER_DAY,
        dist=dist,
        speed_kmh=SPEED_KMH,           # HYPOTHÈSE SIMULÉE
        service_time_h=SERVICE_TIME_H, # HYPOTHÈSE SIMULÉE
        time_windows=TIME_WINDOWS,     # HYPOTHÈSE SIMULÉE
        lambda_loss=LAMBDA_LOSS,       # HYPOTHÈSE SIMULÉE
        require_full_collection=True,
    )

    results_l4 = solve_lexicographic(
        prob=prob_l4,
        vars_dict=vars_l4,
        producers=PRODUCERS,
        vehicles=VEHICLES,
        days=DAYS,
        dist=dist,
        quantity=QUANTITY,
        time_limit_s=120,
        gap_tol=0.01,
    )

    print_results(results_l4, level="L4")

    # Calcul des pertes L_evaluation (formule non-lineaire exacte, post-traitement)
    #   L_evaluation = Sum_i q_i * (1 - exp(-lambda * Delta_t_i))
    # vs L_objectif (linearise, optimise par le MILP) :
    #   L_objectif  = lambda * Sum_i q_i * Delta_t_i
    #
    # Delta_t_i = u_ret[k,t] - a_i  (cahier etape 19)
    #   Hypothese : le vieillissement commence a a_i (ouverture fenetre),
    #   pas au moment du ramassage par le vehicule.
    if results_l4:
        return_time = results_l4.get("return_time", {})
        print("\n  L_evaluation (formule exacte : q_i*(1-exp(-lambda*Delta_t_i))) :")
        print("  [Delta_t_i = u_ret(V_k) - a_i  — vieillissement des la recolte a a_i]")
        print(f"  {'Prod':>4}  {'q_i':>5}  {'u_ret(h)':>8}  {'a_i(h)':>6}  {'Δt(h)':>7}  {'L_i(t)':>8}")
        print("  " + "-" * 50)
        total_loss = 0.0
        for i in PRODUCERS:
            if i in results_l4["assignment"]:
                k, t = results_l4["assignment"][i]
                a_i = TIME_WINDOWS[i][0]
                # u_ret[k,t] : heure de retour à l'usine du véhicule k
                u_ret_kt = return_time.get((k, t), None)
                u_collect = results_l4["timing"].get((i, k, t), a_i)
                if u_ret_kt is None:
                    # Fallback : estimer via l'arc de retour dans la tournée
                    tour = results_l4["tours"].get(k, [])
                    if len(tour) >= 2:
                        last_prod = tour[-2]   # dernier producteur avant l'usine
                        u_last = results_l4["timing"].get((last_prod, k, t), u_collect)
                        u_ret_kt = u_last + SERVICE_TIME_H + dist[(last_prod, 0)] / SPEED_KMH
                    else:
                        u_ret_kt = u_collect
                delta_t = max(u_ret_kt - a_i, 0.0)
                loss_i = QUANTITY[i] * (1 - math.exp(-LAMBDA_LOSS * delta_t))
                total_loss += loss_i
                print(f"  P{i:>3}  {QUANTITY[i]:>5.1f}  {u_ret_kt:>8.3f}  {a_i:>6.1f}  {delta_t:>7.3f}  {loss_i:>8.4f}")
        print("  " + "-" * 50)
        print(f"  {'TOTAL':>4}  {sum(QUANTITY.values()):>5.1f}  {'':>8}  {'':>6}  {'':>7}  {total_loss:>8.4f} t")
        print(f"\n  Reference : L ≈ 2.166 t")
        tol_loss = 0.3
        loss_ok = abs(total_loss - 2.166) <= tol_loss
        print(f"  {'✅ OK' if loss_ok else '⚠️  ECART (voir hypotheses temporelles)'}")

    print(f"\n{SEPARATOR}")
    print("  Fin du programme SM10 Module 1")
    print(SEPARATOR)

    return results_l3, results_l4


if __name__ == "__main__":
    main()
