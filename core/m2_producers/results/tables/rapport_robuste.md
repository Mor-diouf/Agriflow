# RAPPORT AUTOMATIQUE FINAL — MODULE 2 (RÉVISÉ)

## A. K-Means (Stabilité sur 20 réplications)
- **Inertie moyenne (K=2)** : Non capturé
- **ARI (Statistiques sur 190 paires, K=2)** :
  - Moyenne : -0.000
  - Médiane : -0.006
  - Ecart-type : 0.019
  - Min : -0.047
  - Max : 0.095

## B. Scoring et Sensibilité (Kendall Tau-b)
- Base vs Fiabilite : 0.623
- Base vs Proximite : 0.739
- Base vs Volume : 0.756

**Top 5 Producteurs Robustes :**
  ID  Freq_Top_5  Freq_Top_10  Freq_Top_20
P034       0.778        0.989        1.000
P060       0.741        0.879        0.943
P012       0.676        0.849        0.978
P053       0.651        0.728        0.777
P045       0.044        0.682        0.922

## C. Routing End-to-End (Expérience Robuste sur 5 jours)
Objectif M1+M2 : Lexicographique (Max Score pondéré, puis Min Coûts). Volume cible identique.
- **D_total** (Médiane) : M1 = 526.00 | M1+M2 = 526.04 (+0.0%)
- **T_total** (Médiane) : M1 = 60.15 | M1+M2 = 60.15 (+0.0%)
- **km_t** (Médiane) : M1 = 19.48 | M1+M2 = 17.53 (-10.0%)
- **S_moyen** (Médiane) : M1 = 0.50 | M1+M2 = 0.53 (+5.9%)
- **R_agg** (Médiane) : M1 = 0.08 | M1+M2 = 0.07 (-11.5%)

**Statuts du Solveur (M1+M2 Passe 2)** :
- Not Solved : 5/5