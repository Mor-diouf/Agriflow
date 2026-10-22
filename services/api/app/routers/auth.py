"""Connexion des agents de terrain (voir app/auth.py)."""

from datetime import timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import (
    DUMMY_PIN_HASH,
    LOCK_MINUTES,
    MAX_FAILED_ATTEMPTS,
    as_utc,
    bearer,
    current_agent,
    open_session,
    token_digest,
    utcnow,
    verify_pin,
)
from app.db import get_session
from app.field_models import Agent, AgentSession
from app.schemas import AgentOut, LoginIn, LoginResponse

router = APIRouter(prefix="/auth", tags=["Agents"])

BAD_CREDENTIALS = "Identifiant ou code incorrect"


def _agent_out(agent: Agent) -> AgentOut:
    return AgentOut(id=agent.id, login=agent.login, full_name=agent.full_name)


@router.post("/login", response_model=LoginResponse)
def login(body: LoginIn, session: Session = Depends(get_session)):
    """Ouvre une session de 30 jours. 401 si le code est faux, 429 après 5 essais faux (15 min)."""
    agent = session.scalar(select(Agent).where(Agent.login == body.login.strip().lower()))
    now = utcnow()
    if agent is None:
        verify_pin(body.pin, DUMMY_PIN_HASH)
        raise HTTPException(401, BAD_CREDENTIALS)
    if agent.locked_until is not None and as_utc(agent.locked_until) > now:
        wait = as_utc(agent.locked_until) - now
        raise HTTPException(
            429,
            f"Trop d'essais : réessayez dans {ceil(wait.total_seconds() / 60)} min",
            headers={"Retry-After": str(ceil(wait.total_seconds()))},
        )
    if not verify_pin(body.pin, agent.pin_hash):
        agent.failed_attempts += 1
        if agent.failed_attempts >= MAX_FAILED_ATTEMPTS:
            agent.failed_attempts = 0
            agent.locked_until = now + timedelta(minutes=LOCK_MINUTES)
        session.commit()
        raise HTTPException(401, BAD_CREDENTIALS)
    if not agent.active:
        raise HTTPException(403, "Compte désactivé : adressez-vous à votre superviseur")
    agent.failed_attempts = 0
    agent.locked_until = None
    token, expires_at = open_session(session, agent)
    return LoginResponse(token=token, expires_at=expires_at, agent=_agent_out(agent))


@router.get("/me", response_model=AgentOut)
def me(agent: Agent = Depends(current_agent)):
    return _agent_out(agent)


@router.post("/logout", status_code=204)
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), session: Session = Depends(get_session)):
    """Ferme la session de ce téléphone. Sans effet si elle est déjà fermée ou expirée."""
    if credentials is not None:
        session.execute(delete(AgentSession).where(AgentSession.token_hash == token_digest(credentials.credentials)))
        session.commit()
    return Response(status_code=204)
