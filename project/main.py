import sys
import os
import pandas as pd
import numpy as np

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import GLOBAL_SEED, BASE_DIR, RAW_DIR, TABLES_DIR
from data.generator import generate_producers
from clustering.kmeans_analysis import run_kmeans_analysis
from clustering.stability import run_stability_analysis
from scoring.scores import compute_logistic_score
from scoring.sensitivity import run_sensitivity_analysis
from availability.temporal_model import generate_temporal_availability
from routing.distances import generate_distance_matrix, extract_daily_distances
from routing.comparison import run_routing_comparison

def save_report(content: str, filename: str):
    path = os.path.join(TABLES_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    print("=" * 70)
    print("   EXÉCUTION DU PIPELINE (EXPERIENCE ROBUSTE) — MODULE 2")
    print("=" * 70)
    
    report_lines = []
    report_lines.append("# RAPPORT AUTOMATIQUE FINAL — MODULE 2 (RÉVISÉ)\n")
    
    # ---------------------------------------------------------
    # A. DONNÉES ET K-MEANS
    # ---------------------------------------------------------
    df = generate_producers(seed=GLOBAL_SEED)
    D_global = generate_distance_matrix(len(df), seed=GLOBAL_SEED)
    df['d_i0'] = D_global[1:, 0]
    
    res_stab = run_stability_analysis()
    
    report_lines.append("## A. K-Means (Stabilité sur 20 réplications)")
    report_lines.append(f"- **Inertie moyenne (K=2)** : {np.mean([s for s in res_stab['all_inertias']]) if 'all_inertias' in res_stab else 'Non capturé'}")
    report_lines.append(f"- **ARI (Statistiques sur 190 paires, K=2)** :")
    report_lines.append(f"  - Moyenne : {res_stab['ari_metrics']['mean']:.3f}")
    report_lines.append(f"  - Médiane : {res_stab['ari_metrics']['median']:.3f}")
    report_lines.append(f"  - Ecart-type : {res_stab['ari_metrics']['std']:.3f}")
    report_lines.append(f"  - Min : {res_stab['ari_metrics']['min']:.3f}")
    report_lines.append(f"  - Max : {res_stab['ari_metrics']['max']:.3f}\n")
    
    # ---------------------------------------------------------
    # B. SCORING & SENSIBILITÉ
    # ---------------------------------------------------------
    df['Score_Logistique'] = compute_logistic_score(df, w_TR=1/3, w_d=1/3, w_P=1/3)
    kendall_results, df_topk = run_sensitivity_analysis(df)
    
    report_lines.append("## B. Scoring et Sensibilité (Kendall Tau-b)")
    for name, tau in kendall_results.items():
        report_lines.append(f"- Base vs {name} : {tau:.3f}")
        
    report_lines.append("\n**Top 5 Producteurs Robustes :**")
    top5 = df_topk.sort_values("Freq_Top_10", ascending=False).head(5)
    report_lines.append(top5[['ID', 'Freq_Top_5', 'Freq_Top_10', 'Freq_Top_20']].to_string(index=False) + "\n")
    
    # ---------------------------------------------------------
    # C. ROUTING (EXPÉRIENCE ROBUSTE)
    # ---------------------------------------------------------
    print("Exécution de l'expérience robuste MILP sur plusieurs jours...")
    Q_it = generate_temporal_availability(df, n_days=30, seed=GLOBAL_SEED)
    
    days_to_test = [0, 5, 10, 15, 20]
    results_A = []
    results_B = []
    
    for t in days_to_test:
        print(f"  -> Résolution Jour {t}...")
        active_indices = np.where(Q_it[:, t] > 0)[0]
        df_active = df.iloc[active_indices].copy()
        Q_it_active = Q_it[active_indices, t]
        D_t = extract_daily_distances(D_global, active_indices)
        
        res_A, res_B, V_cible = run_routing_comparison(df_active, Q_it_active, D_t, t=t)
        
        if res_A and res_B:
            res_A['Jour'] = t
            res_B['Jour'] = t
            res_A['V_cible'] = V_cible
            res_B['V_cible'] = V_cible
            results_A.append(res_A)
            results_B.append(res_B)
            
    df_A = pd.DataFrame(results_A)
    df_B = pd.DataFrame(results_B)
    
    report_lines.append("## C. Routing End-to-End (Expérience Robuste sur 5 jours)")
    report_lines.append("Objectif M1+M2 : Lexicographique (Max Score pondéré, puis Min Coûts). Volume cible identique.")
    
    if not df_A.empty:
        df_A.to_csv(os.path.join(TABLES_DIR, "routing_A.csv"), index=False)
        df_B.to_csv(os.path.join(TABLES_DIR, "routing_B.csv"), index=False)
        
        # Calcul des statistiques agrégées (Médianes pour robustesse)
        for metric in ['D_total', 'T_total', 'km_t', 'S_moyen', 'R_agg']:
            med_A = df_A[metric].median()
            med_B = df_B[metric].median()
            
            # Delta en pourcentage
            if med_A > 0:
                delta = (med_B - med_A) / med_A * 100
            else:
                delta = 0.0
                
            report_lines.append(f"- **{metric}** (Médiane) : M1 = {med_A:.2f} | M1+M2 = {med_B:.2f} ({delta:+.1f}%)")
            
        report_lines.append("\n**Statuts du Solveur (M1+M2 Passe 2)** :")
        for stat in df_B['Status'].unique():
            count = (df_B['Status'] == stat).sum()
            report_lines.append(f"- {stat} : {count}/{len(df_B)}")
    else:
        report_lines.append("Erreur MILP : aucune solution trouvée.")
        
    report_content = "\n".join(report_lines)
    save_report(report_content, "rapport_robuste.md")
    
    print("\n[SUCCÈS] Pipeline robuste terminé. Rapport généré dans results/tables/rapport_robuste.md")

if __name__ == "__main__":
    main()
