"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : eda.py

Analyse Exploratoire des Données (EDA).
Ordre d'exécution optimisé (validé avec expert mathématique) :
  1. Statistiques Descriptives
  2. Kruskal-Wallis (double test : brut vs Y>0)
  3. Décomposition STL (robust=True)
  4. Stationnarité (Brut vs Résidus)
  5. Autocorrélation (Brut vs Résidus)
  6. Corrélation Croisée (Résidus uniquement)
  7. Bruit Blanc (Résidus)
=============================================================================
"""

import os
import numpy as np
import pandas as pd
from scipy.stats import kruskal, shapiro
from statsmodels.tsa.seasonal import STL
from statsmodels.tsa.stattools import adfuller, kpss
from statsmodels.stats.diagnostic import acorr_ljungbox
import warnings

# Suppress some statsmodels warnings for cleaner output
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

from src.visualization import (
    plot_raw_series,
    plot_seasonal_boxplots,
    plot_correlation_heatmap,
    plot_stl_decomposition,
    plot_acf_pacf_comparison,
    plot_ccf_residuals
)

def step1_descriptive_stats(df: pd.DataFrame) -> None:
    """Affiche les statistiques descriptives de base par zone."""
    print("\n--- 1. STATISTIQUES DESCRIPTIVES ---")
    stats = df.groupby('zone')['Y'].agg(
        Moyenne='mean',
        Mediane='median',
        Max='max',
        Zeros_pct=lambda x: (x == 0).mean() * 100,
        Skewness='skew'
    ).round(2)
    print(stats)

def step2_kruskal_wallis(df: pd.DataFrame) -> None:
    """
    Test de Kruskal-Wallis pour vérifier si les zones sont issues de la 
    même distribution. Effectué deux fois pour éviter le biais des zéros structurels.
    """
    print("\n--- 2. TEST DE KRUSKAL-WALLIS ---")
    
    # 2.1 Sur toutes les données (incluant les zéros)
    # Question : "Les zones diffèrent-elles dans leur profil global ?"
    groups_all = [df[df['zone'] == z]['Y'].values for z in df['zone'].unique()]
    stat_all, p_all = kruskal(*groups_all)
    print("A. Sur TOUTES les données (zéros inclus, biais calendrier possible) :")
    print(f"   Statistique = {stat_all:.2f}, p-value = {p_all:.2e}")
    if p_all < 0.05:
        print("   -> Rejet H0 : Profils globaux significativement différents.")
    else:
        print("   -> Non-rejet H0 : Profils globaux similaires.")
        
    # 2.2 Uniquement sur Y > 0 (saison active)
    # Question : "Les zones diffèrent-elles en intensité de production hors saison morte ?"
    df_active = df[df['Y'] > 0]
    groups_active = [df_active[df_active['zone'] == z]['Y'].values for z in df_active['zone'].unique()]
    stat_act, p_act = kruskal(*groups_active)
    print("\nB. Uniquement sur Y > 0 (saison active, vrai test d'intensité) :")
    print(f"   Statistique = {stat_act:.2f}, p-value = {p_act:.2e}")
    if p_act < 0.05:
        print("   -> Rejet H0 : Intensités de production significativement différentes.")
    else:
        print("   -> Non-rejet H0 : Intensités de production similaires.")

def perform_stl_decomposition(dz: pd.DataFrame, target_col: str = 'Y') -> tuple:
    """Effectue une décomposition STL robuste sur une série temporelle."""
    # Assurer que l'index est temporel
    ts = dz[target_col].values
    
    # STL avec periode 52. On utilise robust=True pour que les gros blocs de zéros
    # structurels ne tirent pas excessivement la tendance vers le bas.
    stl = STL(ts, period=52, robust=True)
    res = stl.fit()
    return res

def check_stationarity(ts: np.ndarray, name: str) -> None:
    """Test ADF et KPSS sur une série."""
    # ADF : H0 = racine unitaire (non stationnaire)
    adf_res = adfuller(ts, autolag='AIC')
    adf_p = adf_res[1]
    
    # KPSS : H0 = stationnaire autour d'une tendance
    # Supress interpolation warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        kpss_res = kpss(ts, regression='c', nlags="auto")
    kpss_p = kpss_res[1]
    
    print(f"  {name:<10} | ADF p-value: {adf_p:.4f} {'(Stat.)' if adf_p < 0.05 else '(Non-Stat.)'} "
          f"| KPSS p-value: {kpss_p:.4f} {'(Stat.)' if kpss_p > 0.05 else '(Non-Stat.)'}")

def step3_to_7_zone_analysis(df: pd.DataFrame) -> None:
    """Exécute les étapes 3 à 7 pour chaque zone individuellement."""
    print("\n--- 3 a 7. ANALYSE TEMPORELLE ET CAUSALE PAR ZONE ---")
    
    for zone in df['zone'].unique():
        print(f"\n[ ZONE : {zone} ]")
        dz = df[df['zone'] == zone].sort_values('t_global')
        
        # --- ETAPE 3 : Décomposition STL ---
        stl_Y = perform_stl_decomposition(dz, 'Y')
        stl_P = perform_stl_decomposition(dz, 'P')
        
        # Sauvegarde graphique de la STL
        plot_stl_decomposition(stl_Y, zone, f"stl_decomp_{zone}.png")
        
        # Extraction des résidus
        resid_Y = stl_Y.resid
        resid_P = stl_P.resid
        raw_Y = dz['Y'].values
        
        print("  ETAPE 3: Décomposition STL (robust=True) terminée. Graphique généré.")
        
        # --- ETAPE 4 : Stationnarité ---
        print("\n  ETAPE 4: Tests de Stationnarité")
        check_stationarity(raw_Y, "Y Brut")
        check_stationarity(resid_Y, "Y Résidus")
        
        # --- ETAPE 5 : Autocorrélation ---
        # Sauvegarde graphique de comparaison
        plot_acf_pacf_comparison(pd.Series(raw_Y), pd.Series(resid_Y), zone, f"acf_pacf_{zone}.png")
        print("\n  ETAPE 5: Comparaison ACF/PACF (Brut vs Résidus) générée.")
        
        # --- ETAPE 6 : Corrélation Croisée Causal (sur résidus) ---
        lags = range(13)
        correlations = []
        for lag in lags:
            if lag == 0:
                corr = np.corrcoef(resid_Y, resid_P)[0, 1]
            else:
                P_shifted = resid_P[:-lag]
                Y_aligned = resid_Y[lag:]
                corr = np.corrcoef(Y_aligned, P_shifted)[0, 1]
            correlations.append(corr)
            
        optimal_lag = lags[np.argmax(np.abs(correlations))]
        max_corr = correlations[optimal_lag]
        
        print(f"\n  ETAPE 6: Retard Météo Optimal (CCF sur résidus STL)")
        print(f"           Lag optimal détecté : {optimal_lag} semaines (r = {max_corr:+.3f})")
        plot_ccf_residuals(lags, correlations, zone, optimal_lag, f"ccf_resid_{zone}.png")
        
        # --- ETAPE 7 : Test Bruit Blanc ---
        # Ljung-Box sur les 10 premiers retards (H0 = pas d'autocorrélation)
        lb_res = acorr_ljungbox(resid_Y, lags=[10], return_df=True)
        lb_p = lb_res.iloc[0]['lb_pvalue']
        
        # Shapiro-Wilk (H0 = normalité)
        sw_stat, sw_p = shapiro(resid_Y)
        
        print("\n  ETAPE 7: Diagnostic des résidus (Bruit Blanc ?)")
        print(f"           Ljung-Box (lag=10) p-value : {lb_p:.4f} -> "
              f"{'Résidus auto-corrélés' if lb_p < 0.05 else 'Bruit blanc (pas auto-corrélation)'}")
        print(f"           Shapiro-Wilk p-value       : {sw_p:.4f} -> "
              f"{'Non-Normaux' if sw_p < 0.05 else 'Normaux'}")

def run_eda(filepath: str = 'data/raw/simulated_harvest_data.csv'):
    """Point d'entrée de l'Analyse Exploratoire."""
    print("=" * 70)
    print("  SM10 Agro — Module 3 : Analyse Exploratoire (Phase D)")
    print("=" * 70)
    
    # Chargement
    import sys
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    full_path = os.path.join(base_dir, filepath)
    
    if not os.path.exists(full_path):
        print(f"Erreur : Fichier introuvable ({full_path})")
        print("Veuillez exécuter 'python sm10_module3.py' d'abord pour générer les données.")
        sys.exit(1)
        
    df = pd.read_csv(full_path)
    print(f"Données chargées : {df.shape[0]} lignes.\n")
    
    # Graphiques globaux
    plot_raw_series(df, "global_raw_series.png")
    plot_seasonal_boxplots(df, "global_seasonal_boxplots.png")
    plot_correlation_heatmap(df, "global_correlation_heatmap.png")
    
    # Étapes 1 et 2
    step1_descriptive_stats(df)
    step2_kruskal_wallis(df)
    
    # Étapes 3 à 7 (Par zone)
    step3_to_7_zone_analysis(df)
    
    print("\n" + "=" * 70)
    print("  Analyse Exploratoire Terminée.")
    print(f"  Graphiques sauvegardés dans le dossier 'results/'.")
    print("=" * 70)

if __name__ == '__main__':
    run_eda()
