"""
Tests de l'API SM10. Lancement (depuis services/api) : python -m tests.test_api
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_config_uses_common_capacity():
    cfg = client.get("/v1/config").json()
    assert cfg["data_status"] == "simulated"
    assert cfg["factory_capacity_t_per_day"] == 28.3
    assert len(cfg["zones"]) == 5
    assert cfg["forecast_seasons"] == [2022, 2023, 2024, 2025]


def test_producers_list_and_filters():
    page = client.get("/v1/producers", params={"limit": 500}).json()
    assert page["total"] == 100 and len(page["items"]) == 100
    scores = [p["score"] for p in page["items"]]
    assert scores == sorted(scores, reverse=True)

    top = client.get("/v1/producers", params={"tier": "prioritaire"}).json()
    assert top["total"] == 20
    assert all(p["tier"] == "prioritaire" for p in top["items"])

    near = client.get("/v1/producers", params={"sort": "distance", "order": "asc", "limit": 5}).json()
    dists = [p["distance_km"] for p in near["items"]]
    assert dists == sorted(dists)

    found = client.get("/v1/producers", params={"search": "p05"}).json()
    assert found["total"] == 10 and all("P05" in p["id"] for p in found["items"])


def test_producers_summary_is_consistent():
    s = client.get("/v1/producers/summary").json()
    assert [t["tier"] for t in s["tiers"]] == ["prioritaire", "standard", "a_surveiller"]
    assert sum(t["count"] for t in s["tiers"]) == s["total"] == 100
    assert abs(sum(t["deliverable_t"] for t in s["tiers"]) - s["deliverable_t"]) < 1e-6
    # Les niveaux sont ordonnés par score
    means = [t["mean_score"] for t in s["tiers"]]
    assert means == sorted(means, reverse=True)


def test_producer_detail_and_404():
    assert client.get("/v1/producers/p001").json()["id"] == "P001"
    assert client.get("/v1/producers/P999").status_code == 404


def test_routing_reference_plan():
    plan = client.get("/v1/routing/reference").json()
    assert plan["status"] == "Optimal"
    assert plan["distance_l3_km"] == 202.0
    assert plan["collected_t"] == 13.0
    # Chaque producteur est visité une fois, sans dépasser la capacité des camions
    visited = [s["producer"] for t in plan["tours"] for s in t["stops"]]
    assert sorted(visited) == [1, 2, 3, 4, 5]
    assert all(t["load_t"] <= t["capacity_t"] for t in plan["tours"])
    assert abs(plan["loss_t"] - sum(s["loss_t"] for t in plan["tours"] for s in t["stops"])) < 1e-9


def test_forecast_filters_and_benchmark():
    pts = client.get("/v1/forecast", params={"year": 2024, "zone": "Kolda"}).json()
    assert len(pts) == 52
    assert all(p["year"] == 2024 and p["zone"] == "Kolda" for p in pts)
    # Les quantiles sont ordonnés : prudent (Q75) <= stress (Q90)
    assert all(p["prudent_t"] <= p["stress_t"] + 1e-9 for p in pts)

    models = {m["model"]: m for m in client.get("/v1/forecast/benchmark").json()}
    assert models["Hurdle-SARIMAX(1,0,0)+Exog"]["level"] == "central"
    assert models["Persistence"]["level"] is None
    assert {m["level"] for m in models.values()} == {"central", "prudent", "stress", None}

    # Les semaines hors saison (0 t) flattent la couverture : elle baisse sur les seules semaines de récolte
    stress = models["Hurdle-Quantile(0.90)"]
    assert stress["harvest_weeks"]["weeks"] < stress["all_weeks"]["weeks"] == 1040
    assert stress["harvest_weeks"]["coverage_pct"] < stress["all_weeks"]["coverage_pct"]
    # Le central (SARIMAX) bat la persistance sur les semaines de récolte
    assert models["Hurdle-SARIMAX(1,0,0)+Exog"]["harvest_weeks"]["mae"] < models["Persistence"]["harvest_weeks"]["mae"]


def test_capacity_scenario_levers():
    base = client.get("/v1/scenarios/capacity").json()
    assert base["summary"]["weeks"] == 208
    assert base["weeks"][0]["capacity_t"] == 28.3 * 7

    # Plus de capacité => moins de semaines en surcharge
    more_cap = client.get("/v1/scenarios/capacity", params={"capacity_factor": 2}).json()
    assert more_cap["summary"]["weeks_over_capacity"] < base["summary"]["weeks_over_capacity"]

    # Le scénario de stress (Q90) charge plus l'usine que le central
    stress = client.get("/v1/scenarios/capacity", params={"level": "stress"}).json()
    assert stress["summary"]["total_excess_t"] > base["summary"]["total_excess_t"]

    one_year = client.get("/v1/scenarios/capacity", params={"year": 2025}).json()
    assert one_year["summary"]["weeks"] == 52

    # Hypothèse d'usine saisonnière (D1) : ~90 jours ouvrés au lieu de 300, soit ×3,33
    seasonal = client.get("/v1/scenarios/capacity", params={"capacity_factor": 300 / 90}).json()
    assert seasonal["summary"]["weeks_over_capacity"] < base["summary"]["weeks_over_capacity"]

    assert client.get("/v1/scenarios/capacity", params={"capacity_factor": 0}).status_code == 422
    assert client.get("/v1/scenarios/capacity", params={"capacity_factor": 6}).status_code == 422
    assert client.get("/v1/scenarios/capacity", params={"level": "inconnu"}).status_code == 422


def run_tests():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"   OK  {t.__name__}")
    print(f"\nTous les tests de l'API sont passés avec succès ! ({len(tests)} tests)")


if __name__ == "__main__":
    run_tests()
