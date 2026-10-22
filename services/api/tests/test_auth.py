"""
Tests des comptes des agents. Lancement (depuis services/api) : python -m tests.test_auth
Base SQLite en mémoire : aucune donnée écrite sur le disque.
"""

import os

os.environ["SM10_DB_URL"] = "sqlite://"

from datetime import timedelta  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import create_agent, utcnow  # noqa: E402
from app.db import SessionLocal, ensure_tables  # noqa: E402
from app.field_models import Agent, AgentSession  # noqa: E402
from app.main import app  # noqa: E402
from scripts.agents import main as agents_cli  # noqa: E402

client = TestClient(app)
ensure_tables()


def new_agent(login: str, pin: str = "250913") -> str:
    with SessionLocal() as s:
        create_agent(s, login, f"Agent {login}", pin)
    return pin


def login(login: str, pin: str):
    return client.post("/v1/auth/login", json={"login": login, "pin": pin})


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_login_and_logout():
    pin = new_agent("mdiedhiou")
    # L'identifiant est insensible à la casse et aux espaces autour
    response = login(" MDiedhiou ", pin)
    assert response.status_code == 200
    body = response.json()
    assert body["agent"]["login"] == "mdiedhiou" and body["agent"]["full_name"] == "Agent mdiedhiou"
    assert client.get("/v1/auth/me", headers=bearer(body["token"])).json()["login"] == "mdiedhiou"

    # Le jeton n'est pas stocké tel quel sur le serveur
    with SessionLocal() as s:
        assert body["token"] not in {x.token_hash for x in s.query(AgentSession)}

    assert client.post("/v1/auth/logout", headers=bearer(body["token"])).status_code == 204
    assert client.get("/v1/auth/me", headers=bearer(body["token"])).status_code == 401


def test_wrong_pin_and_unknown_login_look_the_same():
    new_agent("kbodian")
    wrong, unknown = login("kbodian", "000000"), login("personne", "000000")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()
    assert login("kbodian", "12ab56").status_code == 422


def test_account_locks_after_repeated_failures():
    pin = new_agent("asane")
    for _ in range(5):
        assert login("asane", "999999").status_code == 401
    locked = login("asane", pin)
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0

    # Une fois le délai passé, le bon code fonctionne de nouveau
    with SessionLocal() as s:
        agent = s.query(Agent).filter_by(login="asane").one()
        agent.locked_until = utcnow() - timedelta(seconds=1)
        s.commit()
    assert login("asane", pin).status_code == 200


def test_expired_session_is_refused():
    token = login("aexpire", new_agent("aexpire")).json()["token"]
    with SessionLocal() as s:
        for session in s.query(AgentSession).join(Agent).filter(Agent.login == "aexpire"):
            session.expires_at = utcnow() - timedelta(minutes=1)
        s.commit()
    assert client.get("/v1/field/producers", headers=bearer(token)).status_code == 401


def test_supervisor_script():
    import contextlib
    import io

    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        agents_cli(["add", "ldiatta", "Lamine Diatta"])
    pin = out.getvalue().split(" : ")[1].split()[0]
    assert len(pin) == 6 and pin.isdigit()
    token = login("ldiatta", pin).json()["token"]

    # Désactiver ferme les sessions ouvertes et empêche de se reconnecter
    with contextlib.redirect_stdout(io.StringIO()):
        agents_cli(["disable", "ldiatta"])
    assert client.get("/v1/auth/me", headers=bearer(token)).status_code == 401
    assert login("ldiatta", pin).status_code == 403

    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        agents_cli(["enable", "ldiatta"])
        agents_cli(["reset-pin", "ldiatta"])
    new_pin = out.getvalue().split("Code personnel de Lamine Diatta (ldiatta) : ")[1].split()[0]
    assert login("ldiatta", new_pin).status_code == 200
    if new_pin != pin:
        assert login("ldiatta", pin).status_code == 401


def run_tests():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"   OK  {t.__name__}")
    print(f"\nTous les tests des comptes agents sont passés avec succès ! ({len(tests)} tests)")


if __name__ == "__main__":
    run_tests()
