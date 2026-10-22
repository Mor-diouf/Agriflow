"""
Comptes des agents de terrain.

Un agent se connecte avec son identifiant et un code personnel à 6 chiffres, tiré au hasard
par le superviseur (python -m scripts.agents). Il reçoit un jeton de session valable 30 jours :
le téléphone reste souvent longtemps sans réseau, et l'agent ne doit pas avoir à se reconnecter
chaque jour. Le serveur ne garde que l'empreinte du jeton ; désactiver un agent (téléphone
perdu, départ) ferme aussitôt toutes ses sessions.

Un code à 6 chiffres est court : 5 essais faux bloquent le compte 15 minutes, ce qui rend
l'essai de tous les codes impossible en pratique.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.db import get_session
from app.field_models import Agent, AgentSession

SESSION_DAYS = 30
MAX_FAILED_ATTEMPTS = 5
LOCK_MINUTES = 15
LOGIN_PATTERN = r"^[a-z0-9._-]{2,40}$"

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """SQLite rend les dates sans fuseau : elles ont été enregistrées en UTC."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def new_pin() -> str:
    return f"{secrets.randbelow(10**6):06d}"


def hash_pin(pin: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(pin.encode(), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    _, salt, digest = stored.split("$")
    candidate = hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt), **_SCRYPT)
    return hmac.compare_digest(candidate.hex(), digest)


# Vérifiée pour un identifiant inconnu : la réponse prend le même temps que pour un agent existant
DUMMY_PIN_HASH = hash_pin(new_pin())


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_agent(session: Session, login: str, full_name: str, pin: str) -> Agent:
    agent = Agent(id=str(uuid4()), login=login, full_name=full_name, pin_hash=hash_pin(pin))
    session.add(agent)
    session.commit()
    return agent


def open_session(session: Session, agent: Agent) -> tuple[str, datetime]:
    """Ouvre une session et efface au passage les sessions expirées de l'agent."""
    now = utcnow()
    session.execute(delete(AgentSession).where(AgentSession.agent_id == agent.id, AgentSession.expires_at <= now))
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(days=SESSION_DAYS)
    session.add(AgentSession(token_hash=token_digest(token), agent_id=agent.id, expires_at=expires_at))
    session.commit()
    return token, expires_at


def close_sessions(session: Session, agent: Agent) -> None:
    session.execute(delete(AgentSession).where(AgentSession.agent_id == agent.id))


bearer = HTTPBearer(auto_error=False, description="Jeton obtenu par POST /v1/auth/login")


def unauthorized(detail: str) -> HTTPException:
    return HTTPException(401, detail, headers={"WWW-Authenticate": "Bearer"})


def current_agent(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> Agent:
    """Dépendance FastAPI : l'agent connecté, ou 401 si le jeton manque, est inconnu ou expiré."""
    if credentials is None:
        raise unauthorized("Connexion requise")
    found = session.get(AgentSession, token_digest(credentials.credentials))
    if found is None or as_utc(found.expires_at) <= utcnow() or not found.agent.active:
        raise unauthorized("Session expirée : reconnectez-vous")
    return found.agent
