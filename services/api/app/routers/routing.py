from fastapi import APIRouter

from app import data
from app.schemas import RoutingPlan

router = APIRouter(prefix="/routing", tags=["M1 — Tournées"])


@router.get("/reference", response_model=RoutingPlan)
def reference_plan():
    """Plan optimal (L4 : pertes ≻ temps ≻ distance) de l'instance de référence à 5 producteurs."""
    return data.routing_plan()
