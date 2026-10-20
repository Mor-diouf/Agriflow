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
sm10-connect/             Interface web actuelle (générée avec Lovable, à remplacer)
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

| Endpoint | Module | Contenu |
|---|---|---|
| `GET /v1/config` | — | Capacité usine, zones, poids, niveaux de priorité |
| `GET /v1/producers` | M2 | Liste filtrable (`tier`) et triable (`sort`, `order`, `limit`, `offset`) |
| `GET /v1/producers/summary` | M2 | Effectifs, score moyen et volume par niveau |
| `GET /v1/producers/{id}` | M2 | Fiche d'un producteur |
| `GET /v1/routing/reference` | M1 | Plan de tournées optimal (L4) et pertes post-récolte |
| `GET /v1/forecast` | M3 | Prévisions hebdomadaires par zone (`year`, `zone`) |
| `GET /v1/forecast/benchmark` | M3 | Performance des modèles |
| `GET /v1/scenarios/capacity` | M4 | Charge usine : `level` (central/prudent/stress), `volume_factor`, `capacity_factor`, `year` |

Origines autorisées (CORS) : variable `SM10_CORS_ORIGINS`, par défaut `http://localhost:5173,http://localhost:3000`.

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
| Export vers le web | `python m4_export/export_to_web.py` |
| Serveur vocal | `python services/hawa-tts/hawa_inference_server.py` (depuis la racine) |
