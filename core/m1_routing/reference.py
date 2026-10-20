"""
SM10 Module 1 -- Résolution de l'instance de référence (5 producteurs, 2 véhicules)
sous une forme sérialisable, pour l'API et les interfaces.
"""

from typing import Dict

from m1_routing.sm10_module1 import (
    PRODUCERS, VEHICLES, DAYS, QUANTITY, CAPACITY, DIST_TO_FACTORY, INTER_DIST_KNOWN,
    FACTORY_CAPACITY_PER_DAY, SPEED_KMH, SERVICE_TIME_H, TIME_WINDOWS, LAMBDA_LOSS,
    build_distance_matrix, build_level3_model, build_level4_model,
    solve_and_extract, solve_lexicographic, compute_post_harvest_losses,
)


def solve_reference_instance() -> Dict:
    """
    Résout L3 (distance minimale) puis L4 (pertes ≻ temps ≻ distance) et
    retourne le plan L4 avec ses pertes post-récolte exactes.
    """
    dist = build_distance_matrix(PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN)

    prob_l3, vars_l3 = build_level3_model(
        producers=PRODUCERS, vehicles=VEHICLES, days=DAYS, quantity=QUANTITY,
        capacity=CAPACITY, factory_cap=FACTORY_CAPACITY_PER_DAY, dist=dist,
        require_full_collection=True,
    )
    results_l3 = solve_and_extract(
        prob=prob_l3, vars_dict=vars_l3, producers=PRODUCERS, vehicles=VEHICLES,
        days=DAYS, dist=dist, quantity=QUANTITY, time_limit_s=180, gap_tol=0.005,
    )

    prob_l4, vars_l4 = build_level4_model(
        producers=PRODUCERS, vehicles=VEHICLES, days=DAYS, quantity=QUANTITY,
        capacity=CAPACITY, factory_cap=FACTORY_CAPACITY_PER_DAY, dist=dist,
        speed_kmh=SPEED_KMH, service_time_h=SERVICE_TIME_H,
        time_windows=TIME_WINDOWS, lambda_loss=LAMBDA_LOSS,
        require_full_collection=True,
    )
    results_l4 = solve_lexicographic(
        prob=prob_l4, vars_dict=vars_l4, producers=PRODUCERS, vehicles=VEHICLES,
        days=DAYS, dist=dist, quantity=QUANTITY, time_limit_s=120, gap_tol=0.01,
    )

    losses = compute_post_harvest_losses(results_l4, PRODUCERS, QUANTITY, TIME_WINDOWS, dist)

    tours = []
    for k in VEHICLES:
        stops = [n for n in results_l4["tours"].get(k, []) if n != 0]
        tours.append({
            "vehicle": k,
            "capacity_t": CAPACITY[k],
            "stops": [
                {
                    "producer": i,
                    "quantity_t": QUANTITY[i],
                    "arrival_h": results_l4["timing"].get((i, k, DAYS[0])),
                    "loss_t": losses[i]["loss"],
                }
                for i in stops
            ],
            "load_t": sum(QUANTITY[i] for i in stops),
            "distance_km": results_l4["tour_dist"].get(k, 0.0),
            "return_h": results_l4["return_time"].get((k, DAYS[0])),
        })

    return {
        "status": results_l4["status"],
        "distance_l3_km": results_l3["total_dist"],
        "distance_km": results_l4["total_dist"],
        "collected_t": sum(QUANTITY[i] for i in losses),
        "loss_t": sum(l["loss"] for l in losses.values()),
        "solve_time_s": results_l3["elapsed_s"] + results_l4["elapsed_s"],
        "tours": tours,
        "assumptions": {
            "speed_kmh": SPEED_KMH,
            "service_time_h": SERVICE_TIME_H,
            "lambda_loss_per_h": LAMBDA_LOSS,
            "factory_capacity_t_per_day": FACTORY_CAPACITY_PER_DAY,
        },
    }
