from sm10_module1 import (
    build_level3_model, build_level4_model, build_distance_matrix,
    solve_and_extract, solve_lexicographic,
    PRODUCERS, VEHICLES, DAYS, QUANTITY, CAPACITY, FACTORY_CAPACITY_PER_DAY,
    DIST_TO_FACTORY, INTER_DIST_KNOWN, SPEED_KMH, SERVICE_TIME_H,
    TIME_WINDOWS, LAMBDA_LOSS
)

def test_reference_l3():
    dist = build_distance_matrix(PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN)
    prob, vars_dict = build_level3_model(
        PRODUCERS, VEHICLES, DAYS, QUANTITY, CAPACITY, FACTORY_CAPACITY_PER_DAY, dist
    )
    res = solve_and_extract(prob, vars_dict, PRODUCERS, VEHICLES, DAYS, dist, QUANTITY)
    assert res is not None
    assert res["status"] == "Optimal"
    assert res["total_dist"] == 202.0
    print("test_reference_l3 passed")

def test_reference_l4():
    dist = build_distance_matrix(PRODUCERS, DIST_TO_FACTORY, INTER_DIST_KNOWN)
    prob, vars_dict = build_level4_model(
        PRODUCERS, VEHICLES, DAYS, QUANTITY, CAPACITY, FACTORY_CAPACITY_PER_DAY, dist,
        SPEED_KMH, SERVICE_TIME_H, TIME_WINDOWS, LAMBDA_LOSS
    )
    res = solve_lexicographic(prob, vars_dict, PRODUCERS, VEHICLES, DAYS, dist, QUANTITY)
    assert res is not None
    assert res["status"] == "Optimal"
    assert res["total_dist"] == 202.0
    print("test_reference_l4 passed")

def test_single_producer():
    prod = [1]
    veh = [1]
    days = [1]
    q = {1: 2.0}
    cap = {1: 5.0}
    fcap = 10.0
    dist = build_distance_matrix(prod, {1: 10.0}, {})
    prob, vars_dict = build_level3_model(prod, veh, days, q, cap, fcap, dist)
    res = solve_and_extract(prob, vars_dict, prod, veh, days, dist, q)
    assert res is not None
    assert res["total_dist"] == 20.0
    print("test_single_producer passed")

def test_infeasible_capacity():
    prod = [1]
    veh = [1]
    days = [1]
    q = {1: 6.0}
    cap = {1: 5.0}
    fcap = 10.0
    dist = build_distance_matrix(prod, {1: 10.0}, {})
    prob, vars_dict = build_level3_model(prod, veh, days, q, cap, fcap, dist)
    res = solve_and_extract(prob, vars_dict, prod, veh, days, dist, q)
    assert res is None
    print("test_infeasible_capacity passed")

def test_factory_bottleneck():
    prod = [1, 2]
    veh = [1, 2]
    days = [1]
    q = {1: 5.0, 2: 5.0}
    cap = {1: 5.0, 2: 5.0}
    fcap = 8.0 # Impossible de traiter 10.0 en un jour
    dist = build_distance_matrix(prod, {1: 10.0, 2: 10.0}, {(1,2): 5.0})
    prob, vars_dict = build_level3_model(prod, veh, days, q, cap, fcap, dist)
    res = solve_and_extract(prob, vars_dict, prod, veh, days, dist, q)
    assert res is None
    print("test_factory_bottleneck passed")

def test_subtour_elimination():
    prod = [1, 2, 3]
    veh = [1]
    days = [1]
    q = {1: 1.0, 2: 1.0, 3: 1.0}
    cap = {1: 5.0}
    fcap = 10.0
    dist = {
        (0,0): 0, (1,1): 0, (2,2): 0, (3,3): 0,
        (0,1): 100, (1,0): 100,
        (0,2): 100, (2,0): 100,
        (0,3): 100, (3,0): 100,
        (1,2): 1, (2,1): 1,
        (2,3): 1, (3,2): 1,
        (3,1): 1, (1,3): 1
    }
    prob, vars_dict = build_level3_model(prod, veh, days, q, cap, fcap, dist)
    res = solve_and_extract(prob, vars_dict, prod, veh, days, dist, q)
    assert res is not None
    assert res["total_dist"] == 202.0
    print("test_subtour_elimination passed")

if __name__ == "__main__":
    test_reference_l3()
    test_reference_l4()
    test_single_producer()
    test_infeasible_capacity()
    test_factory_bottleneck()
    test_subtour_elimination()
    print("All tests passed!")
