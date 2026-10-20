from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app import data
from app.schemas import PriorityTier, Producer, ProducerPage, ProducerSummary, TierSummary

router = APIRouter(prefix="/producers", tags=["M2 — Producteurs"])

TIER_ORDER = ["prioritaire", "standard", "a_surveiller"]

SORT_COLUMNS = {
    "score": "Score_Logistique",
    "deliverable": "V_i",
    "distance": "d_i0",
    "reliability": "TR_i",
}


def _to_producer(row) -> Producer:
    return Producer(
        id=row["ID"],
        area_ha=row["A_i"],
        yield_t_per_ha=row["R_i"],
        reliability=row["TR_i"],
        rejection_rate=row["Rej_i"],
        production_t=row["P_i"],
        deliverable_t=row["V_i"],
        distance_km=row["d_i0"],
        score=row["Score_Logistique"],
        tier=row["Niveau"],
    )


@router.get("", response_model=ProducerPage)
def list_producers(
    tier: PriorityTier | None = None,
    search: str | None = Query(None, max_length=20, description="Partie de l'identifiant, ex. « 05 »"),
    sort: Literal["score", "deliverable", "distance", "reliability"] = "score",
    order: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    df = data.producers()
    if tier:
        df = df[df["Niveau"] == tier]
    if search:
        df = df[df["ID"].str.contains(search.strip(), case=False, regex=False)]
    df = df.sort_values(SORT_COLUMNS[sort], ascending=(order == "asc"))
    page = df.iloc[offset: offset + limit]
    return ProducerPage(total=len(df), items=[_to_producer(r) for _, r in page.iterrows()])


@router.get("/summary", response_model=ProducerSummary)
def producers_summary():
    df = data.producers()
    tiers = [
        TierSummary(
            tier=t,
            count=int((df["Niveau"] == t).sum()),
            mean_score=float(df.loc[df["Niveau"] == t, "Score_Logistique"].mean()),
            deliverable_t=float(df.loc[df["Niveau"] == t, "V_i"].sum()),
        )
        for t in TIER_ORDER
    ]
    return ProducerSummary(total=len(df), deliverable_t=float(df["V_i"].sum()), tiers=tiers)


@router.get("/{producer_id}", response_model=Producer)
def get_producer(producer_id: str):
    df = data.producers()
    match = df[df["ID"] == producer_id.upper()]
    if match.empty:
        raise HTTPException(status_code=404, detail=f"Producteur {producer_id} introuvable")
    return _to_producer(match.iloc[0])
