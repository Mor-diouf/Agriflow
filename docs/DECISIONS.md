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
`FACTORY_WORKING_DAYS_PER_YEAR`.

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
- **Doublon dans `services/hawa-tts/generate_hawa_voice.py` :** deux phrases
  portent le nom `hawa_kolda`, si bien que la seconde écrase la première.
