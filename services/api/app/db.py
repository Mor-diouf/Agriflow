"""
Base de données des données terrain (producteurs recensés, relevés de récolte).

Par défaut un fichier SQLite local (services/api/var/agriflow.db), sans installation ;
en production, SM10_DB_URL pointe vers PostgreSQL (ex. postgresql+psycopg://…).
Les résultats des modèles (core/) restent des fichiers : seule la saisie terrain est stockée ici.
"""

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

API_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(API_DIR, "var", "agriflow.db")
DB_URL = os.environ.get("SM10_DB_URL", f"sqlite:///{DEFAULT_DB_PATH}")


class Base(DeclarativeBase):
    pass


def _make_engine(url: str):
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True)
    if url in ("sqlite://", "sqlite:///:memory:"):
        # Base en mémoire (tests) : une seule connexion partagée, sinon chaque requête verrait une base vide
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    os.makedirs(os.path.dirname(url.removeprefix("sqlite:///")) or ".", exist_ok=True)
    return create_engine(url, connect_args={"check_same_thread": False})


engine = _make_engine(DB_URL)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
_tables_ready = False


def get_session() -> Iterator[Session]:
    """Dépendance FastAPI : une session par requête ; les tables sont créées au premier usage."""
    global _tables_ready
    if not _tables_ready:
        from app import field_models  # noqa: F401  (enregistre les tables auprès de Base)

        Base.metadata.create_all(engine)
        _tables_ready = True
    with SessionLocal() as session:
        yield session
