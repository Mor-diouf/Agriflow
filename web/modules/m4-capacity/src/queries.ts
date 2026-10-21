import { api, unwrap, type CapacityQuery } from "@agriflow/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => unwrap(await api.GET("/v1/config")),
    staleTime: Infinity,
  });
}

type Levers = Omit<CapacityQuery, "year">;

/** Scénario sur toutes les saisons : indicateurs globaux et liste des saisons. */
export function useCapacityScenario(levers: Levers) {
  return useQuery({
    queryKey: ["scenarios", "capacity", "all-seasons", levers],
    queryFn: async () => unwrap(await api.GET("/v1/scenarios/capacity", { params: { query: levers } })),
    // Garde le scénario précédent affiché pendant qu'on déplace un curseur
    placeholderData: keepPreviousData,
  });
}

/**
 * Scénario d'une saison. La portée fait partie de la clé : sans elle, tant que la saison n'est pas
 * connue, la clé `{…, year: undefined}` se confondrait avec celle de toutes les saisons, et le
 * graphique recevrait les quatre saisons à la fois.
 */
export function useSeasonCapacityScenario(levers: Levers, year: number | undefined) {
  return useQuery({
    queryKey: ["scenarios", "capacity", "season", year ?? null, levers],
    queryFn: async () => unwrap(await api.GET("/v1/scenarios/capacity", { params: { query: { ...levers, year } } })),
    enabled: year !== undefined,
    placeholderData: keepPreviousData,
  });
}
