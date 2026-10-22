# Journal des décisions — SM10 / AGRIFLOW

Chaque décision structurante est notée ici avec sa justification. Les valeurs
correspondantes vivent dans `core/common/config.py`.

---

## D1 — Capacité de l'usine : 28,3 t/jour (198,1 t/semaine)

**Date :** 2026-10-20

**Constat :** le projet utilisait trois valeurs : 28,3 t/j (M1, M3), 35 t/j
(export M1 vers le web) et 163,5 t/sem (scénarios M4).

**Décision :** 28,3 t/j = 8 500 t/an ÷ 300 jours ouvrés.

**Pourquoi :** c'est la seule valeur dont la source est documentée
(capacité annuelle déclarée). Les deux autres n'ont aucune justification
dans le code.

**À confirmer avec l'usine :** si elle ne tourne que pendant la saison de la
mangue (~90 jours), la capacité réelle serait d'environ 94 t/j. Cela changerait
toutes les conclusions de saturation. Il suffira alors de modifier
`FACTORY_WORKING_DAYS_PER_YEAR`. En attendant, l'interface M4 (Charge usine)
permet de comparer les deux hypothèses d'un clic (« 300 j/an » ou
« Saisonnière · 90 j/an »).

---

## D2 — Producteurs : niveaux de priorité par score, et non segments K-Means

**Date :** 2026-10-20

**Constat :** l'interface annonçait « K-Means k=4 certifié » avec 2 profils
(A = 62, B = 38). Or l'analyse de stabilité du M2
(`core/m2_producers/results/tables/rapport_final.md`) montre :
- un ARI moyen ≈ 0,00 sur 20 réplications : les groupes changent à chaque tirage ;
- un K optimal qui varie (K=2 : 30 %, K=3 : 35 %, K=4 : 15 %…) ;
- la conclusion écrite du rapport : « la segmentation K-Means n'est pas
  suffisamment stable […] pour être considérée comme une structure robuste ».

Le score logistique, lui, est robuste (Kendall tau-b de 0,62 à 0,76 entre
scénarios de poids).

**Décision :** classer les producteurs en 3 niveaux selon le rang de leur score :
- `prioritaire` : les 20 % les mieux notés ;
- `standard` : les 40 % suivants ;
- `a_surveiller` : les 40 % restants.

Les poids du score sont égaux (1/3 fiabilité, 1/3 proximité, 1/3 production),
comme dans le scénario « Base » de l'analyse de sensibilité.

**Pourquoi :** on ne présente à un client que ce que les données soutiennent.
Des niveaux de priorité sont aussi plus simples à expliquer à un responsable
logistique que des clusters.

**Code :** `core/m2_producers/scoring/tiers.py`, testé par `tests/test_tiers.py`.

---

## D3 — Version de référence du M2 : la version robuste (`core/m2_producers/`)

**Date :** 2026-10-20

**Décision :** la version robuste fait foi. Elle a une configuration
centralisée, des tests, l'analyse de stabilité et l'analyse de sensibilité, et
elle appelle le vrai modèle du M1.

`core/m2_producers/v1/` est gelée. Elle n'existe que parce qu'elle alimente
encore l'ancienne interface `sm10-connect` via `core/m4_export/export_to_web.py`.
Elle sera supprimée en même temps que `sm10-connect`.

---

## D4 — L'ancien export web (`m4_export`) n'est pas corrigé

**Date :** 2026-10-20

**Décision :** `export_to_web.py` et l'interface `sm10-connect` restent tels
quels, avec leurs valeurs codées en dur (35 t/j, 163,5 t/sem, profils A/B).

**Pourquoi :** cette interface va être remplacée. Les nouvelles interfaces
liront les résultats calculés via une API branchée sur `core/`, et non des
JSON écrits à la main.

---

## D5 — Identité visuelle : à définir avec le design system

**Date :** 2026-10-20

**Direction proposée :** vert profond (agriculture, confiance) avec un accent
ambre mangue, sur une base de gris neutres de type logiciel d'entreprise.
Elle sera présentée sous forme de maquette avant toute construction d'écran.

---

## D6 — Une API unique entre les modèles et les interfaces

**Date :** 2026-10-20

**Décision :** `services/api` (FastAPI) est le seul point d'accès des
interfaces aux résultats. Toute la logique métier reste dans `core/`
(`m1_routing/reference.py`, `m2_producers/catalog.py`, `m3_forecast/outputs.py`,
`m4_scenarios/capacity.py`). L'API ne fait que valider, filtrer et sérialiser.
Le contrat (`app/schemas.py`) est publié en OpenAPI, ce qui permettra de
générer automatiquement les types TypeScript des interfaces.

**Pourquoi :** les chiffres affichés ne peuvent plus diverger des modèles. Les
scénarios M4 sont désormais **calculés** à partir des prévisions M3 et de la
capacité, et non plus écrits à la main.

**Premier enseignement :** avec 28,3 t/j, l'usine dépasse sa capacité
39 semaines sur 109 semaines actives (2022-2025), avec un pic à 166 % en
semaine 29 de 2025. La capacité de l'usine (D1) devient la question
métier n° 1 à valider.

---

## D7 — Interfaces : un module par package, une plateforme qui assemble

**Date :** 2026-10-20

**Décision :** monorepo pnpm `web/`, avec :
- `packages/ui` : le design system « Forêt & Mangue » (validé sur maquette),
  indépendant du routeur, polices auto-hébergées (aucun appel à Google Fonts) ;
- `packages/api-client` : client `openapi-fetch` typé par `openapi-typescript`
  à partir du contrat de l'API, donc aucun type écrit à la main ;
- `modules/<module>` : chaque module exporte ses écrans et dispose d'un bac à
  sable pour être développé et montré seul ;
- `platform` : la coque, la navigation et les routes.

Technologies : React 19, TypeScript, Vite, TanStack Query, React Router, Vitest.

**Pourquoi :** chaque module peut avancer indépendamment, comme vous le
souhaitiez. Comme ils partagent dès le départ le même design system et le même
client API, l'assemblage n'est pas une étape finale risquée : un module
s'ajoute à la plateforme en deux lignes.

---

## D8 — Prévisions : la fiabilité se juge sur les semaines de récolte

**Date :** 2026-10-21

**Constat :** le benchmark M3 (`benchmark_global_phase_i.csv`) porte sur
1 040 semaines × zones, dont 499 hors saison : 0 t récoltée et, dans 491 cas,
0 t prévue grâce à l'étage hurdle. Ces semaines comptent comme des prévisions
presque parfaites. Elles
divisent l'erreur moyenne par près de deux et gonflent la couverture : le
quantile 90 % couvre 93,1 % des semaines au global, mais 86,7 % des semaines de
récolte.

**Décision :** `/v1/forecast/benchmark` expose les deux jeux de métriques
(`all_weeks` et `harvest_weeks`). L'interface M3 juge les modèles sur les
541 semaines de récolte et n'affiche les métriques globales qu'avec un
avertissement.

**Pourquoi :** c'est pendant la récolte que la prévision sert (usine,
tournées). Sur ces semaines, la prévision centrale se trompe de 5,3 t par zone
et par semaine, soit 26 % de moins que la persistance. Le niveau prudent est
bien calibré (76,0 % pour 75 % visés), le niveau stress un peu juste (86,7 %
pour 90 %).

**Vue « toutes zones » :** les zones sont additionnées, comme dans le M4.
Additionner des quantiles revient à supposer les zones parfaitement corrélées :
les niveaux prudent et stress du total sont donc un peu larges. L'interface le
signale.

---

## D9 — Couleurs des graphiques : des jetons dédiés et vérifiés

**Date :** 2026-10-21

**Décision :** deux jetons de série dans le design system,
`--af-chart-forecast` (#226e44, teinte forêt) pour les prévisions et
`--af-chart-observed` (#4b7eb4, teinte ardoise) pour les valeurs observées,
utilisés par le M3 et le M4.

**Pourquoi :** la paire utilisée jusque-là (forêt 600 / ardoise 700) échouait
au contrôle des palettes : trop sombre, trop peu saturée, et trop proche même
en vision normale (écart 13,5 pour un minimum de 15). La nouvelle paire passe
tous les contrôles (écart 18 en vision normale, 16 sous daltonisme, contraste
supérieur à 3:1). Le rouge « excédent » du M4 reste proche du vert pour un
daltonien (écart 7,5). C'est admis parce que l'excédent se lit aussi par sa
position : au-dessus de la ligne de capacité, séparé par un espace et nommé
dans la légende.

---

## D10 — Prévision à plusieurs semaines (Phase J)

**Date :** 2026-10-22

**Constat :** la Phase I prévoyait à une semaine seulement, avec la récolte
observée la semaine précédente et la température de la semaine prévue (inconnue
au moment de prévoir).

**Décision :** `core/m3_forecast/src/horizon_eval.py` prévoit chaque semaine
1 à 8 semaines à l'avance, avec la seule information connue à l'origine. Le test
`tests/test_horizons.py` vérifie qu'aucune donnée postérieure n'est utilisée.
Les niveaux servis par l'API (`horizon` sur `/v1/forecast` et
`/v1/scenarios/capacity`) sont :
- **central** : combinaison SARIMAX + climatologie, la moyenne de la même
  semaine sur les saisons passées. Le poids de chaque modèle est appris, horizon
  par horizon, sur les saisons précédentes uniquement : 0,8 pour SARIMAX à
  1 semaine, puis 0,3 à 0,4 au-delà de 3 semaines ;
- **prudent / stress** : quantiles 75 % et 90 % directs, recalibrés sur les
  saisons précédentes, en élargissant seulement.

**Pourquoi** (erreur moyenne par zone et par semaine de récolte) :

| Anticipation | SARIMAX seul | Climatologie | Combinaison |
|---|---|---|---|
| 1 semaine | 5,4 t | 7,4 t | **5,3 t** |
| 2 semaines | 6,5 t | 7,4 t | **6,1 t** |
| 4 semaines | 7,7 t | 7,4 t | **6,7 t** |
| 8 semaines | 7,8 t | 7,4 t | **6,9 t** |

SARIMAX seul fait moins bien que la climatologie dès 3 semaines. La combinaison
fait mieux que les deux à tous les horizons, mais son avance fond avec
l'anticipation : 28 % d'erreur en moins que la climatologie à 1 semaine, 7 % à
8 semaines. Au-delà de 2 semaines, la prévision apporte donc surtout la saison
moyenne, légèrement corrigée.

Recalibrage : resserrer un niveau après une saison bien couverte dégradait à la
fois la couverture et la perte quantile, parce que les saisons diffèrent trop
(2022 était très surestimée). Élargir seulement améliore un peu les deux. Le
niveau prudent couvre 71 à 78 % des semaines (75 % visés), le niveau stress 85 à
89 % (90 % visés).

**Effet sur le M4** (300 jours ouvrés, prévision centrale à 1 semaine) :
36 semaines en surcharge sur 112 et un pic à 163 % en semaine 29 de 2025. À
4 semaines d'anticipation, le pic prévu tombe à 146 %, car une prévision lointaine
lisse les extrêmes. Avec une usine saisonnière (90 jours), aucune surcharge.

---

## D11 — Collecte terrain : une base de données, pensée pour le hors-réseau

**Date :** 2026-10-22

**Décision :** l'API enregistre les données de terrain (`/v1/field/…`) dans une
base SQL : un fichier SQLite par défaut, sans installation ; PostgreSQL en
production via `SM10_DB_URL`. Deux tables :
- **producteurs recensés** : village, zone, surface, arbres, variété,
  position GPS, et **consentement obligatoire** du producteur (loi n° 2008-12
  sur les données personnelles) ;
- **relevés de collecte** : quantité collectée, quantité rejetée, et récolte
  que le producteur attend la semaine suivante.

Chaque saisie porte un identifiant créé sur le téléphone, et elle s'écrit en
`PUT`. Une saisie faite hors réseau peut donc être renvoyée plusieurs fois sans
créer de doublon.

**Pourquoi :**
- La couverture réseau en Casamance rurale est intermittente : l'application
  doit fonctionner hors ligne et synchroniser ensuite.
- Le **taux de rejet réel** alimentera le score M2 (cf. point ouvert sur la
  qualité).
- La **récolte annoncée par le producteur** est un signal précoce que le M3
  pourra tester pour dépasser l'horizon de 2 semaines (D10).

**Reste à faire avant un déploiement :** l'authentification des agents (les
écritures sont aujourd'hui ouvertes), une déclaration auprès de la CDP, et
l'application mobile de saisie.

---

## Points ouverts

- **Tournées M1+M2 non résolues :** dans `rapport_robuste.md`, la passe 2 du
  solveur affiche « Not Solved » sur 5 jours sur 5. CBC a atteint sa limite de
  temps sans prouver l'optimalité. Les écarts M1 / M1+M2 de ce rapport ne sont
  donc pas fiables : il faut augmenter la limite de temps, ou rapporter l'écart
  d'optimalité.
- **Pertes post-récolte du M1 mal présentées dans l'ancienne interface :**
  `sm10-connect` affichait « 2,166 t de pertes **évitées** ». Or 2,166 t est la
  perte de référence du plan L4 (valeur recalculée : 2,31 t), pas une perte
  évitée. Pour parler de pertes évitées, il faut comparer à un plan de base,
  ce qui n'est pas encore calculé.
- **Score sans critère de qualité :** le producteur le mieux noté (P053) rejette 30 % de sa livraison. Le score (fiabilité, proximité, production) ignore le taux de rejet. L'interface le signale (seuil 15 %) ; décision métier à prendre : intégrer `Rej_i` au score ?
- **Doublon dans `services/hawa-tts/generate_hawa_voice.py` :** deux phrases
  portent le nom `hawa_kolda`, si bien que la seconde écrase la première.
- **Prévision au-delà de 2 semaines peu informative** (D10). La combinaison bat
  la saison moyenne, mais de peu. Pistes à tester sur données réelles : des
  signaux connus plus tôt (floraison, déclarations des producteurs, pluie
  cumulée de la saison), ou une prévision du volume total de la saison répartie
  sur un profil hebdomadaire.
- **Niveau stress toujours un peu juste** (85 à 89 % pour 90 % visés, D10).
  Avec 4 saisons seulement, le recalibrage n'apprend que sur 1 à 3 saisons
  passées. À revoir quand il y aura des données réelles, avant de s'en servir pour
  dimensionner l'usine.
- **Phase I conservée comme archive :** `quantile_eval.py` et ses résultats
  (`*_phase_i.csv`) ne servent plus à l'API. Ils restent la trace de l'étude ; la
  référence est la Phase J.
