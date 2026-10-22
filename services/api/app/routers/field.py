"""
Collecte terrain : recensement des producteurs et relevés de récolte.

Les écritures se font en PUT sur un identifiant créé par le téléphone de l'agent : une saisie
faite hors réseau est renvoyée telle quelle à la reconnexion, sans risque de doublon
(201 à la création, 200 si elle existait déjà et a été mise à jour).

Toutes les routes demandent un agent connecté (app/auth.py) : elles portent des données
personnelles, et chaque saisie est attribuée à l'agent qui l'a faite.
"""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import current_agent
from app.db import get_session
from app.field_models import Agent, FieldProducer, HarvestRecord
from app.schemas import (
    FieldProducerIn,
    FieldProducerOut,
    FieldSummary,
    FieldWeek,
    HarvestRecordIn,
    HarvestRecordOut,
    ZoneFieldSummary,
)

router = APIRouter(prefix="/field", tags=["Collecte terrain"], dependencies=[Depends(current_agent)])

CODE_PREFIX = "AGR-"


def _in_season(season: int):
    """Filtre sur l'année civile de la collecte, en intervalle de dates pour profiter de l'index."""
    return HarvestRecord.harvest_date.between(date(season, 1, 1), date(season, 12, 31))


def _next_code(session: Session) -> str:
    last = session.scalar(select(func.max(FieldProducer.code)))
    number = int(last.removeprefix(CODE_PREFIX)) + 1 if last else 1
    return f"{CODE_PREFIX}{number:04d}"


def _producer_totals(session: Session, producer_ids: list[str]) -> dict[str, tuple[int, float, float]]:
    """Nombre de relevés, kg collectés et kg rejetés par producteur."""
    rows = session.execute(
        select(
            HarvestRecord.producer_id,
            func.count(),
            func.coalesce(func.sum(HarvestRecord.quantity_kg), 0.0),
            func.coalesce(func.sum(HarvestRecord.rejected_kg), 0.0),
        )
        .where(HarvestRecord.producer_id.in_(producer_ids))
        .group_by(HarvestRecord.producer_id)
    )
    return {pid: (count, kg, rejected) for pid, count, kg, rejected in rows}


def _producer_out(p: FieldProducer, totals: tuple[int, float, float] | None) -> FieldProducerOut:
    count, kg, rejected = totals or (0, 0.0, 0.0)
    return FieldProducerOut(
        id=p.id, code=p.code, full_name=p.full_name, phone=p.phone, village=p.village, zone=p.zone,
        area_ha=p.area_ha, trees=p.trees, main_variety=p.main_variety, latitude=p.latitude,
        longitude=p.longitude, consent_given=p.consent_given, registered_by=p.creator.full_name,
        created_at=p.created_at, updated_at=p.updated_at,
        harvest_count=count, harvested_kg=kg, rejection_rate=rejected / kg if kg > 0 else None,
    )


def _harvest_out(h: HarvestRecord) -> HarvestRecordOut:
    return HarvestRecordOut(
        id=h.id, producer_id=h.producer_id, producer_code=h.producer.code, recorded_by=h.creator.full_name,
        harvest_date=h.harvest_date,
        quantity_kg=h.quantity_kg, rejected_kg=h.rejected_kg, expected_next_week_kg=h.expected_next_week_kg,
        notes=h.notes, season=h.harvest_date.year, week=h.harvest_date.isocalendar().week,
        recorded_at=h.recorded_at, updated_at=h.updated_at,
    )


@router.put("/producers/{producer_id}", response_model=FieldProducerOut, status_code=200)
def upsert_producer(
    producer_id: UUID,
    body: FieldProducerIn,
    response: Response,
    agent: Agent = Depends(current_agent),
    session: Session = Depends(get_session),
):
    """Crée ou met à jour la fiche d'un producteur (identifiant créé par l'application de terrain)."""
    def new_producer() -> FieldProducer:
        return FieldProducer(
            id=str(producer_id), code=_next_code(session), created_by=agent.id, updated_by=agent.id, **body.model_dump()
        )

    p = session.get(FieldProducer, str(producer_id))
    if p is None:
        p = new_producer()
        session.add(p)
        response.status_code = 201
    else:
        for key, value in body.model_dump().items():
            setattr(p, key, value)
        p.updated_by = agent.id
    try:
        session.commit()
    except IntegrityError:
        # Deux créations simultanées ont reçu le même code : on recommence avec le suivant
        session.rollback()
        p = new_producer()
        session.add(p)
        session.commit()
    return _producer_out(p, _producer_totals(session, [p.id]).get(p.id))


@router.get("/producers", response_model=list[FieldProducerOut])
def list_producers(
    zone: str | None = None,
    search: str | None = Query(None, description="Nom, village ou code"),
    session: Session = Depends(get_session),
):
    """Producteurs recensés, du plus récent au plus ancien."""
    query = select(FieldProducer).order_by(FieldProducer.created_at.desc())
    if zone:
        query = query.where(FieldProducer.zone == zone)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            FieldProducer.full_name.ilike(pattern) | FieldProducer.village.ilike(pattern) | FieldProducer.code.ilike(pattern)
        )
    producers = session.scalars(query).all()
    totals = _producer_totals(session, [p.id for p in producers])
    return [_producer_out(p, totals.get(p.id)) for p in producers]


@router.get("/producers/{producer_id}", response_model=FieldProducerOut)
def get_producer(producer_id: UUID, session: Session = Depends(get_session)):
    p = session.get(FieldProducer, str(producer_id))
    if p is None:
        raise HTTPException(404, "Producteur inconnu")
    return _producer_out(p, _producer_totals(session, [p.id]).get(p.id))


@router.put("/harvests/{harvest_id}", response_model=HarvestRecordOut, status_code=200)
def upsert_harvest(
    harvest_id: UUID,
    body: HarvestRecordIn,
    response: Response,
    agent: Agent = Depends(current_agent),
    session: Session = Depends(get_session),
):
    """Crée ou corrige un relevé de collecte. Le producteur doit avoir été synchronisé avant."""
    if session.get(FieldProducer, body.producer_id) is None:
        raise HTTPException(409, "Producteur inconnu : synchroniser d'abord sa fiche")
    h = session.get(HarvestRecord, str(harvest_id))
    if h is None:
        h = HarvestRecord(id=str(harvest_id), created_by=agent.id, updated_by=agent.id, **body.model_dump())
        session.add(h)
        response.status_code = 201
    else:
        for key, value in body.model_dump().items():
            setattr(h, key, value)
        h.updated_by = agent.id
    session.commit()
    session.refresh(h)
    return _harvest_out(h)


@router.get("/harvests", response_model=list[HarvestRecordOut])
def list_harvests(
    producer_id: str | None = None,
    season: int | None = None,
    limit: int = Query(200, ge=1, le=1000),
    session: Session = Depends(get_session),
):
    """Relevés de collecte, du plus récent au plus ancien."""
    query = (
        select(HarvestRecord)
        .options(joinedload(HarvestRecord.producer))
        .order_by(HarvestRecord.harvest_date.desc(), HarvestRecord.recorded_at.desc())
        .limit(limit)
    )
    if producer_id:
        query = query.where(HarvestRecord.producer_id == producer_id)
    if season is not None:
        query = query.where(_in_season(season))
    return [_harvest_out(h) for h in session.scalars(query)]


@router.get("/summary", response_model=FieldSummary)
def field_summary(season: int | None = None, session: Session = Depends(get_session)):
    """Bilan de la collecte : producteurs, volumes et rejets par zone, volumes par semaine."""
    zones: dict[str, dict] = {
        zone: {"producers": n, "records": 0, "kg": 0.0, "rejected": 0.0}
        for zone, n in session.execute(select(FieldProducer.zone, func.count()).group_by(FieldProducer.zone))
    }
    harvests = select(HarvestRecord.harvest_date, HarvestRecord.quantity_kg, HarvestRecord.rejected_kg, FieldProducer.zone).join(
        FieldProducer
    )
    if season is not None:
        harvests = harvests.where(_in_season(season))

    # La semaine ISO se calcule en Python : SQLite et PostgreSQL ne l'expriment pas de la même façon
    weeks: dict[tuple[int, int, str], float] = {}
    records = 0
    for harvest_date, kg, rejected, zone in session.execute(harvests):
        records += 1
        z = zones[zone]
        z["records"] += 1
        z["kg"] += kg
        z["rejected"] += rejected
        key = (harvest_date.year, harvest_date.isocalendar().week, zone)
        weeks[key] = weeks.get(key, 0.0) + kg

    return FieldSummary(
        producers=sum(z["producers"] for z in zones.values()),
        records=records,
        zones=[
            ZoneFieldSummary(
                zone=zone, producers=z["producers"], records=z["records"], harvested_t=z["kg"] / 1000,
                rejected_t=z["rejected"] / 1000, rejection_rate=z["rejected"] / z["kg"] if z["kg"] > 0 else None,
            )
            for zone, z in sorted(zones.items())
        ],
        weeks=[
            FieldWeek(season=s, week=w, zone=zone, harvested_t=kg / 1000)
            for (s, w, zone), kg in sorted(weeks.items())
        ],
    )
