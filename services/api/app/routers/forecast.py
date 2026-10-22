from fastapi import APIRouter, Query

from m3_forecast.outputs import FORECAST_HORIZONS

from app import data
from app.schemas import ForecastMetrics, ForecastPoint, ModelBenchmark

router = APIRouter(prefix="/forecast", tags=["M3 — Prévisions"])


def horizon_query(default: int | None):
    return Query(
        default,
        ge=min(FORECAST_HORIZONS),
        le=max(FORECAST_HORIZONS),
        description="Semaines d'anticipation : la semaine t est prévue avec l'information connue en t − h",
    )


@router.get("", response_model=list[ForecastPoint])
def weekly_forecast(year: int | None = None, zone: str | None = None, horizon: int = horizon_query(1)):
    """Prévisions hebdomadaires out-of-sample par zone, faites `horizon` semaines à l'avance, avec la valeur observée."""
    df = data.predictions(horizon)
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
def model_benchmark(horizon: int | None = horizon_query(None)):
    """
    Performance de chaque modèle à chaque horizon (Phase J), sur toutes les semaines et sur les
    semaines de récolte. Sans `horizon`, tous les horizons.
    """
    df = data.benchmark()
    if horizon is not None:
        df = df[df["horizon"] == horizon]
    metrics = {
        (r["horizon"], r["model"], r["scope"]): ForecastMetrics(
            weeks=r["weeks"], mae=r["mae"], rmse=r["rmse"], bias=r["bias"], coverage_pct=r["coverage_pct"],
        )
        for _, r in df.iterrows()
    }
    rows = df[df["scope"] == "all_weeks"]
    return [
        ModelBenchmark(
            horizon=r["horizon"],
            model=r["model"],
            # Un modèle non retenu n'a pas de niveau : cellule vide, lue comme NaN par pandas
            level=r["level"] if isinstance(r["level"], str) else None,
            all_weeks=metrics[(r["horizon"], r["model"], "all_weeks")],
            harvest_weeks=metrics[(r["horizon"], r["model"], "harvest_weeks")],
        )
        for _, r in rows.iterrows()
    ]
