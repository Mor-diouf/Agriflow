"""
Gestion des comptes des agents de terrain, par le superviseur.
Lancement (depuis services/api) :

    python -m scripts.agents add fbadji "Fatou Badji"   # crée le compte et affiche son code
    python -m scripts.agents list
    python -m scripts.agents reset-pin fbadji           # nouveau code (code oublié, compte bloqué)
    python -m scripts.agents disable fbadji             # téléphone perdu, départ : ferme ses sessions
    python -m scripts.agents enable fbadji

Le code à 6 chiffres est tiré au hasard et affiché une seule fois : le remettre à l'agent
en main propre, sans l'écrire dans un message ni un fichier partagé.
"""

import argparse
import re
import sys

from sqlalchemy import select

from app.auth import LOGIN_PATTERN, close_sessions, create_agent, hash_pin, new_pin
from app.db import SessionLocal, ensure_tables
from app.field_models import Agent


def _find(session, login: str) -> Agent:
    agent = session.scalar(select(Agent).where(Agent.login == login.lower()))
    if agent is None:
        sys.exit(f"Agent inconnu : {login}")
    return agent


def _show_pin(agent: Agent, pin: str) -> None:
    print(f"Code personnel de {agent.full_name} ({agent.login}) : {pin}")
    print("À remettre à l'agent en main propre ; il ne sera plus affiché.")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m scripts.agents", description="Comptes des agents de terrain")
    commands = parser.add_subparsers(dest="command", required=True)
    add = commands.add_parser("add", help="créer un compte")
    add.add_argument("login", help="identifiant : minuscules, chiffres, . _ -")
    add.add_argument("full_name", help="nom complet")
    commands.add_parser("list", help="lister les comptes")
    for name, help_text in (("reset-pin", "tirer un nouveau code et débloquer le compte"),
                            ("disable", "désactiver le compte et fermer ses sessions"),
                            ("enable", "réactiver le compte")):
        commands.add_parser(name, help=help_text).add_argument("login")
    args = parser.parse_args(argv)

    ensure_tables()
    with SessionLocal() as session:
        if args.command == "add":
            login = args.login.strip().lower()
            if not re.fullmatch(LOGIN_PATTERN, login):
                sys.exit("Identifiant invalide : 2 à 40 caractères, minuscules, chiffres, . _ -")
            if session.scalar(select(Agent).where(Agent.login == login)) is not None:
                sys.exit(f"L'identifiant {login} existe déjà")
            pin = new_pin()
            _show_pin(create_agent(session, login, args.full_name.strip(), pin), pin)
        elif args.command == "list":
            agents = session.scalars(select(Agent).order_by(Agent.login)).all()
            if not agents:
                print("Aucun agent. Créer un compte : python -m scripts.agents add <identifiant> \"<nom>\"")
            for a in agents:
                print(f"{a.login:<20} {a.full_name:<30} {'actif' if a.active else 'désactivé'}")
        else:
            agent = _find(session, args.login)
            if args.command == "reset-pin":
                pin = new_pin()
                agent.pin_hash = hash_pin(pin)
                agent.failed_attempts = 0
                agent.locked_until = None
                session.commit()
                _show_pin(agent, pin)
            elif args.command == "disable":
                agent.active = False
                close_sessions(session, agent)
                session.commit()
                print(f"{agent.full_name} est désactivé ; ses téléphones sont déconnectés.")
            else:
                agent.active = True
                session.commit()
                print(f"{agent.full_name} est réactivé.")


if __name__ == "__main__":
    main()
