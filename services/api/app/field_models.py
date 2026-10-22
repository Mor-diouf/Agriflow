"""
Tables de la collecte terrain. Les identifiants sont créés sur le téléphone de l'agent
(UUID) : une saisie faite hors réseau peut être renvoyée plusieurs fois sans doublon.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FieldProducer(Base):
    __tablename__ = "field_producers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    # Code lisible attribué par le serveur (AGR-0001), pour les échanges oraux et les étiquettes
    code: Mapped[str] = mapped_column(String(12), unique=True)
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(20))
    village: Mapped[str] = mapped_column(String(80))
    zone: Mapped[str] = mapped_column(String(40), index=True)
    area_ha: Mapped[float | None] = mapped_column(Float)
    trees: Mapped[int | None] = mapped_column(Integer)
    main_variety: Mapped[str | None] = mapped_column(String(40))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    # Consentement du producteur au traitement de ses données personnelles (loi n° 2008-12)
    consent_given: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    harvests: Mapped[list["HarvestRecord"]] = relationship(back_populates="producer")


class HarvestRecord(Base):
    __tablename__ = "harvest_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    producer_id: Mapped[str] = mapped_column(ForeignKey("field_producers.id"), index=True)
    harvest_date: Mapped[date] = mapped_column(Date, index=True)
    quantity_kg: Mapped[float] = mapped_column(Float)
    rejected_kg: Mapped[float] = mapped_column(Float, default=0.0)
    # Ce que le producteur pense récolter la semaine suivante : un signal précoce pour le M3
    expected_next_week_kg: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    producer: Mapped[FieldProducer] = relationship(back_populates="harvests")
