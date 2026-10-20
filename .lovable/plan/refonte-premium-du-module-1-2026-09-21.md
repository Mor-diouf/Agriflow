# Refonte premium du Module 1

## Résultat attendu
Transformer l’écran actuel en centre de commandement logistique dense et crédible, centré sur la carte de Casamance, sans modifier les données ni les calculs métier.

## Mise en œuvre
- Recomposer l’écran autour d’une carte dominante, d’une barre de contrôle compacte, de cinq indicateurs enrichis et d’un panneau opérationnel latéral.
- Refaire la carte avec relief agricole, fleuve, axes N4/N6, routes secondaires courbes, flux directionnels, producteurs interactifs et véhicules animés.
- Ajouter les interactions demandées : filtres de tournées, changement de couche, zoom, sélection d’un camion, survol détaillé et fiche producteur complète.
- Ajouter des mini-courbes, états, dégradés et animations sobres, avec désactivation automatique lorsque les animations sont réduites.
- Refaire la flotte et le journal dans une présentation compacte, triable et utilisable sur ordinateur, tablette et téléphone.
- Vérifier visuellement les formats grand écran et mobile, l’absence de chevauchement, les interactions et les erreurs.

## Détails techniques
- Conservation des données françaises existantes dans `module1-data`.
- Styles fondés uniquement sur les couleurs sémantiques du projet.
- Carte et graphiques en SVG/CSS natifs, sans dépendance cartographique externe.
- Métadonnées de la page conservées et adaptées au nouveau centre de commandement.
