import sys
import os
import pulp
import pandas as pd
import numpy as np

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from sm10_module1 import build_level4_model

def run_routing_comparison(df_active: pd.DataFrame, Q_it_active: np.ndarray, D_t: np.ndarray, t: int = 0):
    """
    Exécute l'Expérience A (M1 seul) et Expérience B (M1+M2 lexicographique).
    df_active: producteurs ayant Q_it > 0 (la totalité, sans troncature)
    Q_it_active: volumes à collecter
    D_t: matrice de distances (0=Usine, 1..n=Producteurs)
    """
    n_producers = len(df_active)
    P = list(range(1, n_producers + 1))
    K = [1, 2] # 2 camions pour avoir plus de capacité si besoin
    T = [t]
    
    quantity = {i: float(Q_it_active[i-1]) for i in P}
    total_available = sum(quantity.values())
    
    # Capacité des camions (ex: 2 camions de 15t = 30t)
    cap_camion = 15.0
    capacity = {k: cap_camion for k in K}
    total_capacity = sum(capacity.values())
    factory_cap = total_capacity * 2 
    
    # Volume cible : 90% de la ressource la plus contraignante
    V_cible = min(total_capacity * 0.90, total_available * 0.90)
    
    dist_dict = {}
    for i in range(n_producers + 1):
        for j in range(n_producers + 1):
            dist_dict[(i, j)] = float(D_t[i, j])
            
    speed_kmh = 40.0
    service_time_h = 0.5
    time_windows = {i: (6.0, 18.0) for i in P}
    lambda_loss = 0.05
    time_limit = 120 # Limite de temps stricte (secondes)
    
    scores_log = {i: float(df_active.iloc[i-1]['Score_Logistique']) for i in P}
    risques = {i: float(df_active.iloc[i-1]['Rej_i']) for i in P}
    
    def extract_metrics(prob, vars_dict, status_str):
        y = vars_dict["y"]
        z = vars_dict["z"]
        x = vars_dict["x"]
        
        # Helper to safely get varValue
        def get_val(var):
            return var.varValue if var.varValue is not None else 0.0

        D_total = sum(dist_dict[(i, j)] * get_val(y[(i, j, k, t_)]) for (i, j, k, t_) in y if get_val(y[(i, j, k, t_)]) > 0.5)
        Q_total = sum(get_val(z[(i, k, t_)]) for i in P for k in K for t_ in T)
        
        visited_nodes = [i for i in P for k in K for t_ in T if get_val(x[(i, k, t_)]) > 0.5]
        N_prod = len(visited_nodes)
        
        # Le score stratégique total est la somme pondérée au volume collecté
        S_vol_total = sum(scores_log[i] * sum(get_val(z[(i, k, t_)]) for k in K for t_ in T) for i in P)
        
        # Le score stratégique moyen par tonne
        S_moyen = S_vol_total / Q_total if Q_total > 0 else 0
        
        # Risque agrégé pondéré par le volume
        R_agg = sum(risques[i] * sum(get_val(z[(i, k, t_)]) for k in K for t_ in T) for i in P) / Q_total if Q_total > 0 else 0
            
        T_total = D_total / speed_kmh + N_prod * service_time_h
        
        km_t = D_total / Q_total if Q_total > 0 else float('inf')
            
        return {
            "Status": status_str,
            "D_total": D_total,
            "T_total": T_total,
            "Q_total": Q_total,
            "N_prod": N_prod,
            "S_vol_total": S_vol_total,
            "S_moyen": S_moyen,
            "R_agg": R_agg,
            "km_t": km_t
        }

    # ==========================================
    # EXPÉRIENCE A : M1 Seul
    # ==========================================
    prob_A, vars_A = build_level4_model(
        producers=P, vehicles=K, days=T, quantity=quantity, capacity=capacity, factory_cap=factory_cap,
        dist=dist_dict, speed_kmh=speed_kmh, service_time_h=service_time_h, time_windows=time_windows,
        lambda_loss=lambda_loss, require_full_collection=False
    )
    # Contrainte de volume cible
    z_A = vars_A["z"]
    prob_A += pulp.lpSum(z_A[(i, k, t_)] for i in P for k in K for t_ in T) >= V_cible, "V_cible"
    
    prob_A.solve(pulp.PULP_CBC_CMD(msg=0, timeLimit=time_limit))
    res_A = extract_metrics(prob_A, vars_A, pulp.LpStatus[prob_A.status])
    
    # ==========================================
    # EXPÉRIENCE B : M1+M2 (Lexicographique)
    # ==========================================
    # PASSE 1 : Maximiser le score stratégique pondéré par le volume
    prob_B1, vars_B1 = build_level4_model(
        producers=P, vehicles=K, days=T, quantity=quantity, capacity=capacity, factory_cap=factory_cap,
        dist=dist_dict, speed_kmh=speed_kmh, service_time_h=service_time_h, time_windows=time_windows,
        lambda_loss=lambda_loss, require_full_collection=False
    )
    z_B1 = vars_B1["z"]
    prob_B1 += pulp.lpSum(z_B1[(i, k, t_)] for i in P for k in K for t_ in T) >= V_cible, "V_cible"
    
    # Objectif passe 1 : maximiser score pondéré
    prob_B1.objective = -pulp.lpSum(scores_log[i] * z_B1[(i, k, t_)] for i in P for k in K for t_ in T)
    prob_B1.solve(pulp.PULP_CBC_CMD(msg=0, timeLimit=time_limit))
    
    if pulp.LpStatus[prob_B1.status] not in ['Optimal', 'Not Solved']: # Not Solved = Time Limit reached with a feasible solution
        res_B = extract_metrics(prob_B1, vars_B1, pulp.LpStatus[prob_B1.status]) # Infeasible
        return res_A, res_B, V_cible
        
    def get_val_local(var):
        return var.varValue if var.varValue is not None else 0.0

    S_opt = sum(scores_log[i] * get_val_local(z_B1[(i, k, t_)]) for i in P for k in K for t_ in T)
    
    # PASSE 2 : Minimiser les coûts (Objectif d'origine) sous contrainte de score
    prob_B2, vars_B2 = build_level4_model(
        producers=P, vehicles=K, days=T, quantity=quantity, capacity=capacity, factory_cap=factory_cap,
        dist=dist_dict, speed_kmh=speed_kmh, service_time_h=service_time_h, time_windows=time_windows,
        lambda_loss=lambda_loss, require_full_collection=False
    )
    z_B2 = vars_B2["z"]
    prob_B2 += pulp.lpSum(z_B2[(i, k, t_)] for i in P for k in K for t_ in T) >= V_cible, "V_cible"
    # Contrainte stratégique (tolérance de 1% pour éviter les infaisabilités numériques)
    prob_B2 += pulp.lpSum(scores_log[i] * z_B2[(i, k, t_)] for i in P for k in K for t_ in T) >= S_opt * 0.99, "Score_Optimum"
    
    prob_B2.solve(pulp.PULP_CBC_CMD(msg=0, timeLimit=time_limit))
    res_B = extract_metrics(prob_B2, vars_B2, pulp.LpStatus[prob_B2.status])
    
    return res_A, res_B, V_cible
