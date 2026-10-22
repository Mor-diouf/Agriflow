"""
SM10 / AGRIFLOW — API

Expose les résultats calculés par core/ (M1 à M4) aux interfaces web.
Lancement : uvicorn app.main:app --reload   (depuis services/api)
Documentation interactive : http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, field, forecast, platform, producers, routing, scenarios
from app.settings import CORS_ORIGINS

app = FastAPI(
    title="SM10 AGRIFLOW API",
    description="Tournées (M1), producteurs (M2), prévisions (M3), scénarios (M4) et collecte terrain (réservée aux agents connectés). "
                "Résultats des modèles sur données simulées ; la collecte terrain enregistre des données réelles.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "PUT", "POST"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Plateforme"])
def health():
    return {"status": "ok"}


for module in (platform, producers, routing, forecast, scenarios, auth, field):
    app.include_router(module.router, prefix="/v1")
