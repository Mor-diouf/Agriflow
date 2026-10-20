"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : visualization.py

Utilitaires de visualisation pour l'Analyse Exploratoire des Données (EDA).
=============================================================================
"""

import os
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from src.config import RESULTS_DIR

# Configuration globale Matplotlib
plt.style.use('seaborn-v0_8-whitegrid')
plt.rcParams['font.size'] = 12
plt.rcParams['axes.titlesize'] = 14
plt.rcParams['axes.labelsize'] = 12

def plot_raw_series(df: pd.DataFrame, save_path: str = None) -> None:
    """Affiche les séries temporelles brutes par zone."""
    plt.figure(figsize=(15, 8))
    for zone in df['zone'].unique():
        dz = df[df['zone'] == zone].sort_values('t_global')
        plt.plot(dz['t_global'], dz['Y'], label=zone, alpha=0.8, linewidth=1.5)
        
    plt.title("Séries temporelles brutes par zone (Volumes de récolte)")
    plt.xlabel("Index temporel global (t)")
    plt.ylabel("Volume (tonnes/semaine)")
    plt.legend()
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_seasonal_boxplots(df: pd.DataFrame, save_path: str = None) -> None:
    """Affiche les boxplots des volumes par semaine de l'année (toutes zones confondues)."""
    plt.figure(figsize=(16, 6))
    sns.boxplot(x='semaine', y='Y', data=df, color='lightblue', fliersize=2)
    plt.title("Profil saisonnier global : Distribution des volumes par semaine")
    plt.xlabel("Semaine calendaire")
    plt.ylabel("Volume (tonnes/semaine)")
    plt.axvline(x=18 - 1, color='red', linestyle='--', label='Début cible (S18)')
    plt.axvline(x=39 - 1, color='red', linestyle=':', label='Fin cible (S39)')
    plt.legend()
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_correlation_heatmap(df: pd.DataFrame, save_path: str = None) -> None:
    """Heatmap de corrélation linéaire entre Y et les variables météo (Attention : brut !)."""
    cols = ['Y', 'P', 'T', 'H']
    corr = df[cols].corr()
    
    plt.figure(figsize=(6, 5))
    sns.heatmap(corr, annot=True, cmap='coolwarm', vmin=-1, vmax=1, fmt=".2f")
    plt.title("Corrélation croisée brute (Attention au biais saisonnier !)")
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_stl_decomposition(result, zone_name: str, save_path: str = None) -> None:
    """Affiche la décomposition STL pour une zone donnée."""
    fig, axes = plt.subplots(4, 1, figsize=(14, 10), sharex=True)
    
    axes[0].plot(result.observed, label='Observed (Brut)', color='black')
    axes[0].legend(loc='upper left')
    axes[0].set_title(f"Décomposition STL - Zone : {zone_name} (robust=True)")
    
    axes[1].plot(result.trend, label='Trend (Tendance)', color='blue')
    axes[1].legend(loc='upper left')
    
    axes[2].plot(result.seasonal, label='Seasonal (Saisonnalité)', color='green')
    axes[2].legend(loc='upper left')
    
    axes[3].plot(result.resid, label='Residuals (Résidus purs)', color='red')
    axes[3].axhline(0, color='black', linestyle='--', alpha=0.5)
    axes[3].legend(loc='upper left')
    
    plt.xlabel("Temps (t_global)")
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_acf_pacf_comparison(raw_series, resid_series, zone_name: str, save_path: str = None) -> None:
    """Compare ACF/PACF sur série brute vs résidus pour une zone."""
    from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
    
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    fig.suptitle(f"Comparaison ACF/PACF : Brut vs Résidus (Zone : {zone_name})", fontsize=16)
    
    # Brutes
    plot_acf(raw_series.dropna(), ax=axes[0,0], lags=60, title="ACF - Série Brute (Saisonnalité visible)")
    plot_pacf(raw_series.dropna(), ax=axes[0,1], lags=60, title="PACF - Série Brute")
    
    # Résidus
    plot_acf(resid_series.dropna(), ax=axes[1,0], lags=60, title="ACF - Résidus (Saisonnalité retirée)")
    plot_pacf(resid_series.dropna(), ax=axes[1,1], lags=60, title="PACF - Résidus")
    
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_ccf_residuals(lags, correlations, zone_name: str, optimal_lag: int, save_path: str = None) -> None:
    """Affiche la fonction de corrélation croisée (CCF) entre Résidus de Y et Résidus de P."""
    plt.figure(figsize=(10, 5))
    plt.bar(lags, correlations, color='steelblue', alpha=0.7)
    plt.axhline(0, color='black', linewidth=1)
    
    # Ligne de significativité approximative (95%)
    n = 260 # 5 ans * 52 sem
    sig_level = 1.96 / np.sqrt(n)
    plt.axhline(sig_level, color='red', linestyle='--', alpha=0.5)
    plt.axhline(-sig_level, color='red', linestyle='--', alpha=0.5)
    
    plt.axvline(optimal_lag, color='darkorange', linestyle='-', linewidth=2, 
                label=f'Lag Optimal Détecté = {optimal_lag}')
    
    plt.title(f"Corrélation Croisée (CCF) Résidus Y vs Résidus P - Zone : {zone_name}")
    plt.xlabel("Retard (Lag en semaines)")
    plt.ylabel("Corrélation r_YP(lag)")
    plt.legend()
    
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()

def plot_persistence_residuals_by_week(df: pd.DataFrame, save_path: str = None) -> None:
    """
    Affiche les résidus (Erreur = Y_true - Y_pred) du modèle de persistance (M0a)
    en fonction de la semaine calendaire pour mettre en évidence l'erreur structurelle 
    au début de la saison.
    """
    # Créer un DataFrame temporaire pour le calcul
    df_temp = df.copy().sort_values(['zone', 't_global'])
    
    # Y_pred de la persistance = Y_{t-1}
    df_temp['Y_pred'] = df_temp.groupby('zone')['Y'].shift(1).fillna(0)
    df_temp['Erreur'] = df_temp['Y'] - df_temp['Y_pred']
    
    plt.figure(figsize=(12, 6))
    
    # Tracer un boxplot par semaine
    sns.boxplot(x='semaine', y='Erreur', data=df_temp, color='lightcoral', fliersize=2)
    
    plt.axhline(0, color='black', linewidth=1)
    
    # Lignes pour les transitions
    plt.axvline(x=15 - 1, color='orange', linestyle='--', label='Début Zone Grise (S15)')
    plt.axvline(x=18 - 1, color='red', linestyle='-', linewidth=2, label='Pic d\'erreur attendu (S18)')
    plt.axvline(x=42 - 1, color='orange', linestyle='--', label='Fin Zone Grise (S42)')
    
    plt.title("Le 'Piège de la Persistance' : Erreur de prédiction (Y_true - Y_pred) par semaine")
    plt.xlabel("Semaine calendaire")
    plt.ylabel("Erreur (Tonnes)")
    
    # Limiter un peu l'axe y pour la lisibilité si besoin
    y_min, y_max = df_temp['Erreur'].quantile(0.01), df_temp['Erreur'].quantile(0.99)
    plt.ylim(y_min * 1.2, y_max * 1.2)
    
    plt.legend()
    plt.tight_layout()
    if save_path:
        plt.savefig(os.path.join(RESULTS_DIR, save_path), dpi=300)
    plt.close()
