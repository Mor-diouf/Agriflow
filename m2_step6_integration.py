import numpy as np
import pandas as pd
import pulp
import os

def run_integration_test(input_path):
    print("=" * 60)
    print("      INTÉGRATION END-TO-END (M1 + M2)")
    print("=" * 60)
    
    # 1. Sélection Quotidienne
    df = pd.read_csv(input_path)
    # Chargement fictif de Q_it (généré dans M2)
    Q_it = np.load(input_path.replace('.csv', '_Qit.npy'))
    
    t_test = 10
    active_mask = Q_it[:, t_test] > 0
    df_active = df[active_mask].copy()
    
    # On sélectionne les 8 premiers pour l'exemple (pour garder un MILP rapide)
    df_active = df_active.head(8).reset_index(drop=True)
    n = len(df_active)
    
    print(f"\nJour {t_test} : {n} producteurs actifs sélectionnés pour le test.")
    
    # 2. Données de transport (d_ij)
    # On crée des coordonnées fictives pour générer des distances réalistes (symétriques, respectant l'inégalité triangulaire)
    np.random.seed(42)
    coords = np.random.rand(n + 1, 2) * 100 # +1 pour l'usine (index 0)
    d_ij = np.zeros((n + 1, n + 1))
    for i in range(n + 1):
        for j in range(n + 1):
            d_ij[i, j] = np.linalg.norm(coords[i] - coords[j])
            
    # Capacité du camion (ex: 2 camions de 5t = 10t max)
    # Total disponible aujourd'hui
    total_dispo = Q_it[df_active.index, t_test].sum()
    capacite_camion = total_dispo * 0.6 # Le camion ne peut prendre que 60% du total, il FAUT choisir !
    
    q_i = [0] + list(Q_it[df_active.index, t_test])
    S_log = [0] + list(df_active['Score_Logistique'])
    
    print(f"Capacité disponible : {total_dispo:.2f} t | Capacité max camion : {capacite_camion:.2f} t")
    
    # --- FONCTION DE RÉSOLUTION MILP ---
    def solve_daily_routing(use_priorities=False):
        prob = pulp.LpProblem("Routing", pulp.LpMinimize)
        
        # Variables
        x = pulp.LpVariable.dicts("x", ((i, j) for i in range(n+1) for j in range(n+1)), cat='Binary')
        y = pulp.LpVariable.dicts("y", (i for i in range(n+1)), cat='Binary')
        u = pulp.LpVariable.dicts("u", (i for i in range(1, n+1)), lowBound=0, cat='Continuous')
        
        # Objectif
        distance_totale = pulp.lpSum(d_ij[i, j] * x[i, j] for i in range(n+1) for j in range(n+1))
        
        if use_priorities:
            # Expérience D : On maximise le score des producteurs visités (soustrait à la min)
            # lambda paramètre l'importance de la stratégie
            lambda_prio = 5.0
            priorite_satisfaite = pulp.lpSum(S_log[i] * y[i] for i in range(1, n+1))
            prob += distance_totale - lambda_prio * priorite_satisfaite
        else:
            # Expérience C : MILP de Base (Distance uniquement)
            prob += distance_totale
            
        # Contraintes
        prob += y[0] == 1 # L'usine est visitée
        
        # Flux
        for j in range(n+1):
            prob += pulp.lpSum(x[i, j] for i in range(n+1) if i != j) == y[j]
        for i in range(n+1):
            prob += pulp.lpSum(x[i, j] for j in range(n+1) if i != j) == y[i]
            
        # MTZ (Sous-tours)
        for i in range(1, n+1):
            for j in range(1, n+1):
                if i != j:
                    prob += u[i] - u[j] + (n) * x[i, j] <= n - 1
                    
        # Capacité
        prob += pulp.lpSum(q_i[i] * y[i] for i in range(1, n+1)) <= capacite_camion
        
        # Solve
        prob.solve(pulp.PULP_CBC_CMD(msg=0))
        
        # Résultats
        dist_val = pulp.value(distance_totale)
        vol_val = sum(q_i[i] * y[i].varValue for i in range(1, n+1))
        score_moyen = np.mean([S_log[i] for i in range(1, n+1) if y[i].varValue > 0.5])
        
        return dist_val, vol_val, score_moyen
        
    # 3. Étape C - Expérience de Base
    print("\n--- Étape C : Expérience de Base (M1 seul) ---")
    dist_C, vol_C, score_C = solve_daily_routing(use_priorities=False)
    print(f"Distance : {dist_C:.1f} km | Volume collecté : {vol_C:.2f} t | Score logistique moyen : {score_C:.1f}")
    
    # 4. Étape D - Expérience avec Stratégie M2
    print("\n--- Étape D : Expérience avec Stratégie (M1 + M2) ---")
    dist_D, vol_D, score_D = solve_daily_routing(use_priorities=True)
    print(f"Distance : {dist_D:.1f} km | Volume collecté : {vol_D:.2f} t | Score logistique moyen : {score_D:.1f}")
    
    print("\n--- Étape E : Comparaison des Compromis ---")
    print(f"Surcoût Kilométrique pour respecter la stratégie : +{dist_D - dist_C:.1f} km ({(dist_D/dist_C - 1)*100:.1f}%)")
    print(f"Gain Stratégique (Score moyen) : +{score_D - score_C:.1f} points")

if __name__ == "__main__":
    path = os.path.join(os.path.dirname(__file__), 'scored_producers.csv')
    if os.path.exists(path):
        run_integration_test(path)
    else:
        print("Fichier introuvable.")
