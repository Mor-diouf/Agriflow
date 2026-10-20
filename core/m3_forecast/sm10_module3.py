"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : sm10_module3.py — Point d'entrée principal

Exécute séquentiellement les étapes du Module 3 :
  Étape 1 → Génération / chargement des données
  Étape 2 → Analyse exploratoire            (à venir)
  Étape 3 → Modèles de référence            (à venir)
  ...
=============================================================================
"""

import os
import sys

# Ajouter le répertoire du module au path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.data_generator import (
    generate_harvest_data,
    validate_generated_data,
    print_generation_summary,
)
from src.config import DATA_RAW_DIR


def main():
    """Point d'entrée principal du Module 3."""

    print("=" * 70)
    print("  SM10 Agro -- Module 3 : Prevision des volumes de recolte")
    print("  [DONNEE SIMULEE] -- Toutes les donnees sont simulees.")
    print("=" * 70)

    # ─── Étape 1 : Génération du jeu de données simulé ───
    print("\n>>> ETAPE 1 : Generation des donnees simulees...")
    df, metadata = generate_harvest_data(n_zones=5, n_seasons=5, seed=42)

    # ─── Validation structurelle ───
    print("\n>>> Validation structurelle...")
    validate_generated_data(df, metadata)
    print("[OK] Toutes les validations passees.")

    # ─── Résumé diagnostique ───
    print_generation_summary(df, metadata)

    # ─── Export CSV ───
    output_path = os.path.join(DATA_RAW_DIR, 'simulated_harvest_data.csv')
    df.to_csv(output_path, index=False)
    print(f"\n[OK] Donnees exportees : {output_path}")
    print(f"     {df.shape[0]} lignes x {df.shape[1]} colonnes")

    # ─── Vérifications supplémentaires ───
    # Production totale par saison (toutes zones)
    print("\n-- Production totale par saison (toutes zones) --")
    for year in sorted(df['annee'].unique()):
        total = df[df['annee'] == year]['Y'].sum()
        print(f"  Saison {year} : {total:>8.1f} tonnes")

    # Comparaison avec la capacité usine
    from src.config import FACTORY_CAPACITY_WEEKLY
    print(f"\n-- Capacite usine hebdomadaire : {FACTORY_CAPACITY_WEEKLY:.0f} t/sem "
          f"[HYPOTHESE SIMULEE] --")

    for year in sorted(df['annee'].unique()):
        dy = df[df['annee'] == year]
        for sem in range(18, 40):
            vol_sem = dy[dy['semaine'] == sem]['Y'].sum()
            if vol_sem > FACTORY_CAPACITY_WEEKLY:
                print(f"  ! Saison {year}, semaine {sem} : "
                      f"{vol_sem:.1f} t > capacité {FACTORY_CAPACITY_WEEKLY:.0f} t")
                break
        else:
            continue
        break  # Un seul avertissement suffit pour la démo

    print("\n[FIN] Module 3 -- Etape 1 terminee.")
    return df, metadata


if __name__ == '__main__':
    main()
