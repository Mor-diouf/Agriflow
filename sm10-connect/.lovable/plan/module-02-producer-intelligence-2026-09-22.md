# Module 02 — Producer Intelligence

## Objectif
Créer un nouvel écran `/module2` de niveau enterprise pour le scoring et la segmentation des producteurs, puis ajouter une navigation cohérente entre les modules. Toutes les valeurs seront explicitement identifiées comme simulées.

## Interface à construire
- Ajouter une coque de navigation AGRIFLOW commune et dense : Command Center, Operations, Intelligence et System, avec Module 02 sélectionné.
- Créer l’en-tête Producer Intelligence avec période, actualisation, export et lancement d’analyse.
- Afficher six KPI exécutifs avec tendances, contexte et badge « Demo data ».
- Construire une vue analytique avec filtres actifs, segmentation modifiable, scatter plot interactif et tableau comparatif des segments.
- Ajouter la table producteurs avec recherche, tri, filtres, pagination et ouverture d’un profil latéral détaillé.
- Ajouter les blocs Scoring Engine, Segmentation Engine, qualité du modèle, optimisation de K et carte schématique simulée de la Casamance.
- Générer les Operational Insights à partir des données réellement affichées, puis proposer les actions recommandées correspondantes.
- Relier Module 01 et Module 02 dans la navigation sans créer de faux écrans pour les modules non encore réalisés.

## Données et interactions
- Créer un jeu de démonstration déterministe de producteurs et des agrégats dérivés, clairement marqué comme simulé.
- Les filtres Zone, Cluster, Priority, Risk, Production, Quality et Regularity mettront à jour graphiques, segments, table et insights.
- Les clusters pourront être renommés localement dans l’interface.
- Le scatter plot offrira les vues Cluster, Priority Score, Risk Score et Geographic Zone avec fiche au survol.
- Le panneau producteur affichera scores, profils et historique 12 mois.
- Les poids de scoring seront modifiables à titre de démonstration et accompagnés d’un avertissement méthodologique.

## Qualité et validation
- Conserver les tokens, polices et conventions visuelles du Module 01, avec une identité analytique propre au Module 02.
- Vérifier les métadonnées de page, le rendu ordinateur/mobile, les interactions principales, l’absence de chevauchement et les erreurs de compilation ou de console.
