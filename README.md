# SM10 / AGRIFLOW

Plateforme d'optimisation de la filière mangue en Casamance.

## Structure

```
core/                     Modèles Python (M1 à M4)
  common/config.py        Paramètres partagés : capacité usine, zones, seed, poids, niveaux
  m1_routing/             M1 — Tournées de collecte (MILP PuLP, niveaux L3/L4)
  m2_producers/           M2 — Segmentation K-Means et scoring des producteurs (version robuste)
    v1/                   M2 — Première version (scripts + CSV) : alimente encore l'export web
  m3_forecast/            M3 — Prévision des récoltes (hurdle SARIMAX, quantiles)
  m4_scenarios/           M4 — Scénarios de charge usine (flux M3 face à la capacité)
  m4_export/              Ancien export JSON vers sm10-connect (gelé, cf. D4)
  requirements.txt
services/
  api/                    API FastAPI : expose les résultats de core/ aux interfaces
  hawa-tts/               M5 — Serveur de synthèse vocale Wolof « Hawa » (FastAPI)
web/                      Nouvelles interfaces (pnpm workspace)
  packages/ui/            Design system « Forêt & Mangue » : jetons, composants, coque
  packages/api-client/    Client typé, types générés depuis le contrat OpenAPI de l'API
  modules/m2-producers/   Interface M2, utilisable seule (bac à sable) ou dans la plateforme
  modules/m3-forecast/    Interface M3 : prévisions de récolte et fiabilité des modèles
  modules/m4-capacity/    Interface M4 : charge usine et leviers de scénario
  platform/               Assemblage : navigation commune et routes de tous les modules
sm10-connect/             Ancienne interface Lovable (à supprimer)
_archive/                 Ancienne copie du front à la racine — à supprimer après validation
```

## Installation

```sh
pip install -e core                                 # installe les modèles comme package
pip install -r services/api/requirements.txt        # API
pip install -r services/hawa-tts/requirements.txt   # seulement pour la voix Hawa
```

## API

```sh
cd services/api
uvicorn app.main:app --reload       # http://localhost:8000/docs
python -m tests.test_api            # tests
```

Sous Windows, le rechargement automatique (`--reload`) reste parfois bloqué après une
modification : l'API continue de servir l'ancienne version. L'arrêter (Ctrl+C) et la relancer.

| Endpoint | Module | Contenu |
|---|---|---|
| `GET /v1/config` | — | Capacité usine, zones, saisons prévues, poids, niveaux de priorité |
| `GET /v1/producers` | M2 | Liste filtrable (`tier`) et triable (`sort`, `order`, `limit`, `offset`) |
| `GET /v1/producers/summary` | M2 | Effectifs, score moyen et volume par niveau |
| `GET /v1/producers/{id}` | M2 | Fiche d'un producteur |
| `GET /v1/routing/reference` | M1 | Plan de tournées optimal (L4) et pertes post-récolte |
| `GET /v1/forecast` | M3 | Prévisions hebdomadaires par zone (`year`, `zone`), faites `horizon` semaines à l'avance (1 à 8, D10) |
| `GET /v1/forecast/benchmark` | M3 | Performance des modèles par horizon, sur toutes les semaines et sur les semaines de récolte (D8) |
| `GET /v1/scenarios/capacity` | M4 | Charge usine : `level` (central/prudent/stress), `volume_factor`, `capacity_factor`, `year`, `horizon` |

| `PUT /v1/field/producers/{id}` | Terrain | Recense ou met à jour un producteur (identifiant UUID créé par l'application, consentement obligatoire) |
| `GET /v1/field/producers` | Terrain | Producteurs recensés (`zone`, `search`), avec volumes collectés et taux de rejet |
| `PUT /v1/field/harvests/{id}` | Terrain | Enregistre ou corrige un relevé de collecte |
| `GET /v1/field/harvests` | Terrain | Relevés (`producer_id`, `season`) |
| `GET /v1/field/summary` | Terrain | Bilan par zone et par semaine |

Données terrain : SQLite dans `services/api/var/agriflow.db` (hors git), ou la base indiquée par
`SM10_DB_URL` (PostgreSQL en production). Tests : `python -m tests.test_field`.

Origines autorisées (CORS) : variable `SM10_CORS_ORIGINS`, par défaut `http://localhost:5173,http://localhost:3000`.

## Interfaces web

Prérequis : Node 22 et pnpm. L'API doit tourner sur le port 8000 (section précédente) ;
en développement, Vite lui transmet les appels `/api/...`.

```sh
cd web
pnpm install
pnpm dev          # plateforme complète : http://localhost:5173
pnpm dev:m2       # module M2 seul (bac à sable) : http://localhost:5174
pnpm dev:m3       # module M3 seul (bac à sable) : http://localhost:5176
pnpm dev:m4       # module M4 seul (bac à sable) : http://localhost:5175
pnpm typecheck    # vérification TypeScript de tous les packages
pnpm test         # tests des modules
pnpm build        # version de production (web/platform/dist)
```

Après tout changement de l'API, régénérer le contrat et les types :

```sh
cd services/api && python -m scripts.export_openapi
cd ../../web && pnpm gen:api
```

Ajouter un module : créer `web/modules/<module>/` sur le modèle de `m2-producers`
(composants de `@agriflow/ui`, données via `@agriflow/api-client`), puis le brancher
dans `web/platform/src/App.tsx` (entrée `MODULES` + route). Lancer ensuite `pnpm install`
et **relancer `pnpm dev`** : un serveur Vite déjà démarré ne voit pas un package ajouté
après coup (erreur « Failed to resolve import »).

Les décisions de modélisation (capacité usine, niveaux de priorité…) sont
expliquées dans [docs/DECISIONS.md](docs/DECISIONS.md).

## Commandes

Une fois `core` installé, les commandes `python -m ...` se lancent depuis n'importe quel dossier.
Les autres se lancent depuis `core/`.

| Action | Commande |
|---|---|
| Tests M1 | `python m1_routing/test_audit.py` |
| Pipeline M2 (version robuste) | `python -m m2_producers.main` |
| Tests M2 | `python -m m2_producers.tests.test_data` (idem `test_scoring`, `test_clustering`, `test_tiers`, `test_routing`) |
| Pipeline M2 v1 (gelé, cf. D3) | `cd m2_producers/v1` puis `m2_data_generation.py` → `m2_kmeans_segmentation.py` → `m2_scoring.py` |
| M3 (génération des données) | `cd m3_forecast && python sm10_module3.py` |
| M3 (prévisions 1 à 8 semaines, servies par l'API, ~5 min) | `cd m3_forecast && python src/horizon_eval.py` |
| Tests M3 (horizons) | `cd m3_forecast && python -m unittest tests.test_horizons` |
| Export vers le web | `python m4_export/export_to_web.py` |
| Serveur vocal | `python services/hawa-tts/hawa_inference_server.py` (depuis la racine) |
