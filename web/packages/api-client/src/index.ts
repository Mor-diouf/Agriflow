/**
 * Client typé de l'API SM10. Les types viennent du contrat OpenAPI de
 * services/api (régénérer avec `pnpm gen:api` après tout changement d'API).
 */
import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

/** En développement, Vite redirige /api vers l'API Python (voir vite.config.ts). */
const baseUrl: string = import.meta.env.VITE_SM10_API_URL ?? "/api";

// fetch lu à chaque appel (et non capturé à l'import) : les tests peuvent le remplacer
export const api = createClient<paths>({ baseUrl, fetch: (request) => globalThis.fetch(request) });

type Schemas = components["schemas"];
export type PlatformConfig = Schemas["PlatformConfig"];
export type Producer = Schemas["Producer"];
export type ProducerPage = Schemas["ProducerPage"];
export type ProducerSummary = Schemas["ProducerSummary"];
export type TierSummary = Schemas["TierSummary"];
export type PriorityTier = Producer["tier"];
export type RoutingPlan = Schemas["RoutingPlan"];
export type ForecastPoint = Schemas["ForecastPoint"];
export type CapacityScenario = Schemas["CapacityScenario"];

export type ProducerQuery = NonNullable<paths["/v1/producers"]["get"]["parameters"]["query"]>;

/** Lève une erreur lisible si l'API répond en erreur, pour que les écrans affichent un état d'échec. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data === undefined) {
    throw new Error(`API ${result.response.status} sur ${new URL(result.response.url, "http://x").pathname}`);
  }
  return result.data;
}
