"""
Écrit le contrat OpenAPI de l'API dans web/packages/api-client/openapi.json,
d'où les types TypeScript des interfaces sont générés.
Lancement (depuis services/api) : python -m scripts.export_openapi
"""

import json
import os

from app.main import app

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_DIR = os.path.dirname(os.path.dirname(API_DIR))
OUT_PATH = os.path.join(REPO_DIR, "web", "packages", "api-client", "openapi.json")

if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(app.openapi(), f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[OK] Contrat OpenAPI écrit : {OUT_PATH}")
