# RAPPORT AUTOMATIQUE FINAL — MODULE 2

## A. Données
- Taille du dataset : 100 producteurs
- Contrôles de validité : Succès

## B. K-Means (Stabilité sur 20 réplications)
- Freq(K*=2) = 30 %
- Freq(K*=3) = 35 %
- Freq(K*=4) = 15 %
- Freq(K*=5) = 15 %
- Freq(K*=6) = 5 %
- ARI moyen pour K=2 : -0.000

**Conclusion de stabilité** :
La segmentation K-Means n'est pas suffisamment stable dans le scénario synthétique étudié pour être considérée comme une structure robuste.

## C. Scoring et Sensibilité (Kendall Tau-b)
- Base vs Fiabilite : 0.623
- Base vs Proximite : 0.739
- Base vs Volume : 0.756

**Top 5 Producteurs Robustes (Fréquence Top-10) :**
 Freq_Top_5  Freq_Top_10  Freq_Top_20   ID
      0.778        0.989        1.000 P034
      0.741        0.879        0.943 P060
      0.676        0.849        0.978 P012
      0.651        0.728        0.777 P053
      0.044        0.682        0.922 P045

## D. Disponibilité
- Volume total généré sur l'horizon : 1438.04 t

## E. Routing End-to-End (Jour de test)
- **Distance** : 118.0 km -> 250.9 km (+112.6%)
- **Temps**    : 4.0 h -> 9.3 h (+134.7%)
- **Volume**   : 4.38 t -> 5.23 t (+19.4%)
- **Score**    : 0.6 pts -> 0.5 pts (-14.4%)
- **Risque**   : 5.2 % -> 4.9 % (-4.6%)

## F. Conclusion Expérimentale
L'expérience démontre que l'intégration du Module 2 dans le solveur MILP du Module 1 modifie 
les tournées pour satisfaire les priorités stratégiques. Les indicateurs calculés quantifient 
explicitement le compromis opérationnel (surcoût distance vs gain stratégique), sans jugement métier a priori.