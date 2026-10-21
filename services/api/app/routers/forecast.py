from fastapi import APIRouter

from m3_forecast.outputs import LEVEL_MODELS

from app import data
from app.schemas import ForecastMetrics, ForecastPoint, ModelBenchmark

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
    """Performance de chaque modèle testé (Phase I), sur toutes les semaines et sur les semaines de récolte."""
    preds = data.predictions()
    harvest = data.harvest_benchmark().set_index("Modèle")
    n_all, n_harvest = len(preds), int((preds["y_true"] > 0).sum())
    return [
        ModelBenchmark(
            model=r["Modèle"],
            level=LEVEL_MODELS.get(r["Modèle"]),
            all_weeks=ForecastMetrics(
                weeks=n_all, mae=r["MAE"], rmse=r["RMSE"], bias=r["Biais"], coverage_pct=r["Couverture (%)"],
            ),
            harvest_weeks=ForecastMetrics(
                weeks=n_harvest,
                mae=harvest.at[r["Modèle"], "MAE cond"],
                rmse=harvest.at[r["Modèle"], "RMSE cond"],
                bias=harvest.at[r["Modèle"], "Biais cond"],
                coverage_pct=harvest.at[r["Modèle"], "Couverture cond (%)"],
            ),
        )
        for _, r in data.benchmark().iterrows()
    ]
