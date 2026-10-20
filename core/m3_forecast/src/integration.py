"""
SM10 Module 3 -- Integration avec les Modules 1 et 2.

=== Interface M3 -> M1 (routage) ===
  Desagregation zone -> producteurs :
    Q_hat_{i,t} = Y_hat_{z(i), w(t)} * (A_i * R_i * TR_i) / sum_j * (1/7)
  [HYPOTHESE H5] — repartition proportionnelle au potentiel individuel.

  Classe ForecastInterface avec methode :
    .disaggregate(zone, week, producer_profile) -> Q_it

=== Interface M3 -> M2 (scoring) ===
  - Ajuster le score de priorite selon la prevision de volume
  - Detecter les zones a risque (volume prevu vs capacite de collecte)
  - Mettre a jour V_estime_i avec la prevision M3

=== Comparaison avec la capacite usine ===
  Excedent_t = max(0, Y_hat_total_t - F_t)
  Sous_utilisation_t = max(0, F_t - Y_hat_total_t)
  F_t = 198 t/semaine [HYPOTHESE SIMULEE]
"""

# TODO: Implementer dans la Phase M (etape 15 du plan de travail)
# Depend de : forecasting.py, config.py (FACTORY_CAPACITY_WEEKLY)
