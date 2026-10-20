import module1Data from "./module1_vrp_real.json";
import module2Data from "./module2_producers_real.json";
import module3Data from "./module3_forecast_real.json";
import scenariosData from "./module4_scenarios_real.json";

export { module1Data, module2Data, module3Data, scenariosData };

export type Scenario = (typeof scenariosData.scenarios)[number];
export type ProducerReal = (typeof module2Data.producers)[number];
export type TrajectoryPoint = (typeof module3Data.global_trajectory)[number];
