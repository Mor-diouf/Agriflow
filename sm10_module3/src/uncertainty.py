"""
SM10 Module 3 -- Intervalles de prevision et incertitude.

Responsabilites :
  - Bootstrap des residus (etage 2 du hurdle)
  - Bootstrap conjoint (etages 1 + 2) pour ne pas sous-estimer la variance
  - Non-negativite : L_{z,t} = max(0, Y_hat - z_{a/2} * sigma_hat)
  - Quantile regression (alternative)
  - Conformal prediction (garantie de couverture marginale)

Distinction fondamentale :
  Intervalle de CONFIANCE : incertitude sur E[Y | X]
  Intervalle de PREVISION : incertitude sur Y lui-meme (inclut epsilon)
  L'IP est TOUJOURS plus large que l'IC.
"""

# TODO: Implementer dans la Phase K (etape 13 du plan de travail)
# Depend de : time_series_models.py, evaluation.py
