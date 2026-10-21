import { api, unwrap, type CapacityQuery } from "@agriflow/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => unwrap(await api.GET("/v1/config")),
    staleTime: Infinity,
  });
}

export function useCapacityScenario(query: CapacityQuery, enabled = true) {
  return useQuery({
    queryKey: ["scenarios", "capacity", query],
    queryFn: async () => unwrap(await api.GET("/v1/scenarios/capacity", { params: { query } })),
    enabled,
    // Garde le scénario précédent affiché pendant qu'on déplace un curseur
    placeholderData: keepPreviousData,
  });
}
