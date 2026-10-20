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
  m4_export/              M4 — Scénarios et export JSON vers l'interface web
  requirements.txt
services/
  hawa-tts/               M5 — Serveur de synthèse vocale Wolof « Hawa » (FastAPI)
sm10-connect/             Interface web actuelle (générée avec Lovable, à remplacer)
_archive/                 Ancienne copie du front à la racine — à supprimer après validation
```

## Installation

```sh
pip install -e core                                 # installe les modèles comme package
pip install -r services/hawa-tts/requirements.txt   # seulement pour la voix Hawa
```

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
