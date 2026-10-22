"""
Tests de la collecte terrain. Lancement (depuis services/api) : python -m tests.test_field
Base SQLite en mémoire : aucune donnée écrite sur le disque.
"""

import os

os.environ["SM10_DB_URL"] = "sqlite://"

from datetime import date, timedelta  # noqa: E402
from uuid import uuid4  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)


def producer(**overrides):
    body = {
        "full_name": "Awa Diatta", "phone": "+221 77 123 45 67", "village": "Bambali", "zone": "Sédhiou",
        "area_ha": 3.5, "trees": 210, "main_variety": "Kent", "latitude": 12.71, "longitude": -15.55,
        "consent_given": True,
    }
    return body | overrides


def harvest(producer_id: str, **overrides):
    body = {"producer_id": producer_id, "harvest_date": str(date.today()), "quantity_kg": 800, "rejected_kg": 40}
    return body | overrides


def test_register_producer_is_idempotent():
    pid = str(uuid4())
    first = client.put(f"/v1/field/producers/{pid}", json=producer())
    assert first.status_code == 201
    assert first.json()["code"].startswith("AGR-") and first.json()["harvest_count"] == 0

    # Même envoi rejoué après une coupure réseau : pas de doublon, même code
    again = client.put(f"/v1/field/producers/{pid}", json=producer(village="Bambali Sud"))
    assert again.status_code == 200
    assert again.json()["code"] == first.json()["code"] and again.json()["village"] == "Bambali Sud"
    assert sum(p["id"] == pid for p in client.get("/v1/field/producers").json()) == 1

    other = client.put(f"/v1/field/producers/{uuid4()}", json=producer(full_name="Lamine Sané")).json()
    assert other["code"] != first.json()["code"]


def test_producer_validation():
    url = f"/v1/field/producers/{uuid4()}"
    assert client.put(url, json=producer(consent_given=False)).status_code == 422
    assert client.put(url, json=producer(zone="Dakar")).status_code == 422
    # Latitude et longitude inversées : hors de la Casamance
    assert client.put(url, json=producer(latitude=-15.55, longitude=12.71)).status_code == 422
    assert client.put(url, json=producer(phone="appelle-moi")).status_code == 422
    assert client.put("/v1/field/producers/pas-un-uuid", json=producer()).status_code == 422
    assert client.get(f"/v1/field/producers/{uuid4()}").status_code == 404


def test_harvest_records_and_rejection_rate():
    pid = str(uuid4())
    client.put(f"/v1/field/producers/{pid}", json=producer(full_name="Fatou Badji", zone="Kolda"))

    hid = str(uuid4())
    assert client.put(f"/v1/field/harvests/{hid}", json=harvest(pid, expected_next_week_kg=1200)).status_code == 201
    # Correction du même relevé : mise à jour, pas de second relevé
    corrected = client.put(f"/v1/field/harvests/{hid}", json=harvest(pid, quantity_kg=1000, rejected_kg=100))
    assert corrected.status_code == 200 and corrected.json()["week"] == date.today().isocalendar().week
    client.put(f"/v1/field/harvests/{uuid4()}", json=harvest(pid, quantity_kg=1000, rejected_kg=0))

    p = client.get(f"/v1/field/producers/{pid}").json()
    assert p["harvest_count"] == 2 and p["harvested_kg"] == 2000
    assert abs(p["rejection_rate"] - 0.05) < 1e-9

    records = client.get("/v1/field/harvests", params={"producer_id": pid}).json()
    assert len(records) == 2 and {r["producer_code"] for r in records} == {p["code"]}
    assert client.get("/v1/field/harvests", params={"producer_id": pid, "season": 1999}).json() == []


def test_harvest_validation():
    pid = str(uuid4())
    client.put(f"/v1/field/producers/{pid}", json=producer())
    url = f"/v1/field/harvests/{uuid4()}"
    assert client.put(url, json=harvest(pid, rejected_kg=900)).status_code == 422
    assert client.put(url, json=harvest(pid, quantity_kg=0)).status_code == 422
    tomorrow = str(date.today() + timedelta(days=1))
    assert client.put(url, json=harvest(pid, harvest_date=tomorrow)).status_code == 422
    # Relevé arrivé avant la fiche de son producteur : refusé, l'application resynchronisera
    assert client.put(url, json=harvest(str(uuid4()))).status_code == 409


def test_summary_by_zone_and_week():
    pid = str(uuid4())
    client.put(f"/v1/field/producers/{pid}", json=producer(zone="Oussouye"))
    client.put(f"/v1/field/harvests/{uuid4()}", json=harvest(pid, quantity_kg=2000, rejected_kg=500))

    summary = client.get("/v1/field/summary", params={"season": date.today().year}).json()
    oussouye = next(z for z in summary["zones"] if z["zone"] == "Oussouye")
    assert oussouye["harvested_t"] == 2.0 and oussouye["rejection_rate"] == 0.25
    assert summary["producers"] == len(client.get("/v1/field/producers").json())
    assert any(w["zone"] == "Oussouye" and w["harvested_t"] == 2.0 for w in summary["weeks"])
    assert client.get("/v1/field/summary", params={"season": 1999}).json()["records"] == 0


def run_tests():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"   OK  {t.__name__}")
    print(f"\nTous les tests de la collecte terrain sont passés avec succès ! ({len(tests)} tests)")


if __name__ == "__main__":
    run_tests()
