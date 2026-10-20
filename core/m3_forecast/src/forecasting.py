"""
SM10 Module 3 -- Prevision operationnelle par zone.

Responsabilites :
  - Prevision par zone z et horizon h : Y_hat_{z, t+h | t}
  - Aggregation : Y_hat_total = sum_z Y_hat_{z,t}
  - Intervalle agrege (sous hypothese H4 d'independance conditionnelle)
  - Tableau de sortie final :
      | Zone | Semaine | Prevision | Borne basse | Borne haute |
  - Export CSV et objet Python pour les Modules 1/2
"""

# TODO: Implementer dans la Phase L (etape 14 du plan de travail)
# Depend de : time_series_models.py, uncertainty.py
