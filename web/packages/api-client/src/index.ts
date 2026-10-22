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

let tokenSource: () => string | null = () => null;
let onUnauthorized: (() => void) | null = null;

/** D'où lire le jeton de session de l'agent connecté ; il est joint à chaque appel. */
export function setAuthTokenSource(source: () => string | null) {
  tokenSource = source;
}

/** Appelé quand le serveur refuse le jeton envoyé (session expirée, fermée ou compte désactivé). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

api.use({
  onRequest({ request }) {
    const token = tokenSource();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  },
  onResponse({ request, response }) {
    if (response.status === 401 && request.headers.has("Authorization")) onUnauthorized?.();
    return response;
  },
});

type Schemas = components["schemas"];
export type PlatformConfig = Schemas["PlatformConfig"];
export type Producer = Schemas["Producer"];
export type ProducerPage = Schemas["ProducerPage"];
export type ProducerSummary = Schemas["ProducerSummary"];
export type TierSummary = Schemas["TierSummary"];
export type PriorityTier = Producer["tier"];
export type RoutingPlan = Schemas["RoutingPlan"];
export type ForecastPoint = Schemas["ForecastPoint"];
export type ModelBenchmark = Schemas["ModelBenchmark"];
export type ForecastMetrics = Schemas["ForecastMetrics"];
export type CapacityScenario = Schemas["CapacityScenario"];
export type WeeklyLoad = Schemas["WeeklyLoad"];
export type ForecastLevel = CapacityScenario["level"];

export type FieldProducerIn = Schemas["FieldProducerIn"];
export type FieldProducer = Schemas["FieldProducerOut"];
export type HarvestRecordIn = Schemas["HarvestRecordIn"];
export type HarvestRecord = Schemas["HarvestRecordOut"];
export type FieldAgent = Schemas["AgentOut"];
export type LoginResponse = Schemas["LoginResponse"];

export type ProducerQuery = NonNullable<paths["/v1/producers"]["get"]["parameters"]["query"]>;
export type CapacityQuery = NonNullable<paths["/v1/scenarios/capacity"]["get"]["parameters"]["query"]>;

/** Lève une erreur lisible si l'API répond en erreur, pour que les écrans affichent un état d'échec. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.data === undefined) {
    throw new Error(`API ${result.response.status} sur ${new URL(result.response.url, "http://x").pathname}`);
  }
  return result.data;
}
