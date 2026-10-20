# =============================================================================
# Script de vérification indépendant — Étapes 1 et 2
# Ne fait AUCUN appel au solveur : calcul purement arithmétique.
# =============================================================================
import sys
sys.path.insert(0, ".")
from sm10_module1 import (
    PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN,
    QUANTITY, SPEED_KMH, SERVICE_TIME_H, TIME_WINDOWS, LAMBDA_LOSS,
    build_distance_matrix,
)
import math

SEP = "=" * 70

# =====================================================================
# ÉTAPE 1 : Symétrie de la matrice de distances
# =====================================================================
print(f"\n{SEP}")
print("  ÉTAPE 1 : Vérification de la symétrie de la matrice de distances")
print(SEP)

print("\n  INTER_DIST_KNOWN (données d'entrée) :")
for (i, j), d in sorted(INTER_DIST_KNOWN.items()):
    print(f"    d({i},{j}) = {d}")

dist = build_distance_matrix(PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN)

print("\n  Matrice complète retournée par build_distance_matrix() :")
nodes = [0] + PRODUCERS
header = "      " + "".join(f"{j:>6}" for j in nodes)
print(header)
for i in nodes:
    row = f"  {i:>3} "
    for j in nodes:
        row += f"{dist[(i,j)]:>6.1f}"
    print(row)

print("\n  Assertions de symétrie :")
all_ok = True
for i in nodes:
    for j in nodes:
        if abs(dist[(i, j)] - dist[(j, i)]) > 1e-10:
            print(f"    ❌ ECHEC : dist[{i},{j}]={dist[(i,j)]} != dist[{j},{i}]={dist[(j,i)]}")
            all_ok = False

# Vérifications explicitement demandées
pairs = [(3, 4), (3, 5), (4, 5)]
for (i, j) in pairs:
    sym_ok = abs(dist[(i, j)] - dist[(j, i)]) < 1e-10
    status = "OK" if sym_ok else "ECHEC"
    print(f"    d({i},{j})={dist[(i,j)]:.1f}  d({j},{i})={dist[(j,i)]:.1f}  -> {status}")
    if not sym_ok:
        all_ok = False

if all_ok:
    print("\n  ✅ Matrice de distances SYMÉTRIQUE partout.")
else:
    print("\n  ❌ ASYMÉTRIE DÉTECTÉE — corriger build_distance_matrix().")

# =====================================================================
# ÉTAPE 2 : Calcul manuel de u_ret pour les deux ordres de V2
# =====================================================================
print(f"\n{SEP}")
print("  ÉTAPE 2 : Calcul manuel de u_ret (hors solveur)")
print(f"  Paramètres : v={SPEED_KMH} km/h, s_i={SERVICE_TIME_H} h, u0=6.0 h")
print(SEP)

u0 = 6.0  # départ usine

def compute_tour_manually(tour_nodes, dist, speed, service, u_start):
    """
    Calcule arc par arc le temps de retour à l'usine.
    tour_nodes = [0, P_a, P_b, ..., 0]
    Retourne (u_ret, details) où details est la trace de chaque arc.
    """
    details = []
    u_current = u_start
    for idx in range(len(tour_nodes) - 1):
        i = tour_nodes[idx]
        j = tour_nodes[idx + 1]
        d_ij = dist[(i, j)]
        tau_ij = d_ij / speed

        if i == 0:
            # Arc usine -> premier producteur : pas de service à l'usine
            u_arrive_j = u_current + tau_ij
            details.append({
                "arc": f"{i}->{j}",
                "d_ij": d_ij,
                "tau_ij": tau_ij,
                "s_i": 0.0,
                "u_depart": u_current,
                "u_arrive": u_arrive_j,
            })
        else:
            # Arc producteur i -> noeud j : service s_i chez i, puis trajet
            u_depart_i = u_current + service
            u_arrive_j = u_depart_i + tau_ij
            details.append({
                "arc": f"{i}->{j}",
                "d_ij": d_ij,
                "tau_ij": tau_ij,
                "s_i": service,
                "u_depart": u_depart_i,
                "u_arrive": u_arrive_j,
            })
        u_current = u_arrive_j
    return u_current, details


# Séquence A : 0 -> P3 -> P5 -> P4 -> 0  (ordre L3)
tour_A = [0, 3, 5, 4, 0]
# Séquence B : 0 -> P4 -> P5 -> P3 -> 0  (ordre L4 du solveur)
tour_B = [0, 4, 5, 3, 0]

for label, tour in [("A (L3 : 0->P3->P5->P4->0)", tour_A),
                     ("B (L4 : 0->P4->P5->P3->0)", tour_B)]:
    u_ret, details = compute_tour_manually(tour, dist, SPEED_KMH, SERVICE_TIME_H, u0)
    print(f"\n  Séquence {label}")
    print(f"  {'Arc':>8}  {'d(km)':>7}  {'tau(h)':>7}  {'s_i(h)':>7}  {'depart':>8}  {'arrivee':>8}")
    print("  " + "-" * 60)
    total_dist = 0.0
    for d in details:
        total_dist += d["d_ij"]
        print(f"  {d['arc']:>8}  {d['d_ij']:>7.1f}  {d['tau_ij']:>7.4f}  {d['s_i']:>7.2f}"
              f"  {d['u_depart']:>8.4f}  {d['u_arrive']:>8.4f}")
    print("  " + "-" * 60)
    print(f"  Distance totale : {total_dist:.1f} km")
    print(f"  u_ret (retour usine) = {u_ret:.4f} h")

# Vérification que les deux donnent le même u_ret
u_ret_A, _ = compute_tour_manually(tour_A, dist, SPEED_KMH, SERVICE_TIME_H, u0)
u_ret_B, _ = compute_tour_manually(tour_B, dist, SPEED_KMH, SERVICE_TIME_H, u0)

print(f"\n  Comparaison :")
print(f"    u_ret(A) = {u_ret_A:.4f} h")
print(f"    u_ret(B) = {u_ret_B:.4f} h")
print(f"    Écart    = {abs(u_ret_A - u_ret_B):.6f} h")

if abs(u_ret_A - u_ret_B) < 1e-4:
    print("    ✅ IDENTIQUES (à 10⁻⁴ près) — comme attendu avec distances symétriques.")
else:
    print("    ⚠️  DIFFÉRENTS — à investiguer (distances asymétriques ou erreur).")

# Calcul des pertes pour chaque séquence avec u_ret correct
print(f"\n{SEP}")
print("  Calcul des pertes post-récolte pour les deux séquences (formule exacte)")
print(f"  Lambda = {LAMBDA_LOSS} h⁻¹, a_i = {TIME_WINDOWS[1][0]} h pour tous")
print(SEP)

for label, tour, u_ret_val in [("A (L3 : P3->P5->P4)", tour_A, u_ret_A),
                                  ("B (L4 : P4->P5->P3)", tour_B, u_ret_B)]:
    print(f"\n  Séquence {label} — u_ret = {u_ret_val:.4f} h")
    print(f"  {'Prod':>6}  {'q_i':>5}  {'a_i':>5}  {'dt_i':>7}  {'L_i':>8}")
    print("  " + "-" * 40)
    total_L = 0.0
    producers_in_tour = [n for n in tour if n != 0]
    for i in producers_in_tour:
        a_i = TIME_WINDOWS[i][0]
        dt_i = u_ret_val - a_i
        L_i = QUANTITY[i] * (1 - math.exp(-LAMBDA_LOSS * dt_i))
        total_L += L_i
        print(f"  P{i:>4}  {QUANTITY[i]:>5.1f}  {a_i:>5.1f}  {dt_i:>7.4f}  {L_i:>8.4f}")
    print("  " + "-" * 40)
    print(f"  L_total = {total_L:.4f} t")

# Même chose pour V1
tour_V1 = [0, 1, 2, 0]  # ou [0, 2, 1, 0] — même chose
u_ret_V1, _ = compute_tour_manually(tour_V1, dist, SPEED_KMH, SERVICE_TIME_H, u0)
tour_V1b = [0, 2, 1, 0]
u_ret_V1b, _ = compute_tour_manually(tour_V1b, dist, SPEED_KMH, SERVICE_TIME_H, u0)

print(f"\n  V1 : tour [0,1,2,0] -> u_ret = {u_ret_V1:.4f} h")
print(f"  V1 : tour [0,2,1,0] -> u_ret = {u_ret_V1b:.4f} h")

print(f"\n  Pertes TOTALES (V1 + V2) avec Séquence A (ordre L3) :")
total_all = 0.0
for i in PRODUCERS:
    a_i = TIME_WINDOWS[i][0]
    if i in [1, 2]:
        u_ret_val = u_ret_V1
    else:
        u_ret_val = u_ret_A
    dt_i = u_ret_val - a_i
    L_i = QUANTITY[i] * (1 - math.exp(-LAMBDA_LOSS * dt_i))
    total_all += L_i
    print(f"    P{i} : u_ret={u_ret_val:.4f}, dt={dt_i:.4f}, L={L_i:.4f} t")
print(f"  L_total = {total_all:.4f} t")
print(f"  Référence cahier : L ≈ 2.166 t")

print(f"\n{SEP}")
print("  FIN des vérifications indépendantes (étapes 1-2)")
print(SEP)
