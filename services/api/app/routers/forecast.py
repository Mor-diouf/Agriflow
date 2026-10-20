from fastapi import APIRouter

from app import data
from app.schemas import ForecastPoint, ModelBenchmark

router = APIRouter(prefix="/forecast", tags=["M3 — Prévisions"])


@router.get("", response_model=list[ForecastPoint])
def weekly_forecast(year: int | None = None, zone: str | None = None):
    """Prévisions hebdomadaires out-of-sample par zone, avec la valeur observée."""
    df = data.predictions()
    if year is not None:
        df = df[df["fold"] == year]
    if zone is not None:
        df = df[df["zone"] == zone]
    return [
        ForecastPoint(
            year=r["fold"], zone=r["zone"], week=r["semaine"], actual_t=r["y_true"],
            central_t=r["pred_sarimax"], prudent_t=r["pred_q75"], stress_t=r["pred_q90"],
        )
        for _, r in df.iterrows()
    ]


@router.get("/benchmark", response_model=list[ModelBenchmark])
def model_benchmark():
    """Performance de chaque modèle testé (Phase I)."""
    return [
        ModelBenchmark(
            model=r["Modèle"], mae=r["MAE"], rmse=r["RMSE"], bias=r["Biais"],
            coverage_pct=r["Couverture (%)"],
        )
        for _, r in data.benchmark().iterrows()
    ]
