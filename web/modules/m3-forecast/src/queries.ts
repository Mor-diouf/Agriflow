import { api, unwrap } from "@agriflow/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => unwrap(await api.GET("/v1/config")),
    staleTime: Infinity,
  });
}

/** Prévisions d'une saison pour toutes les zones : le choix de la zone se fait dans la page, sans nouvel appel. */
export function useSeasonForecast(year: number | undefined) {
  return useQuery({
    queryKey: ["forecast", year],
    queryFn: async () => unwrap(await api.GET("/v1/forecast", { params: { query: { year } } })),
    enabled: year !== undefined,
    // Résultats déterministes (seed fixe) : une saison déjà chargée n'est pas redemandée
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

export function useModelBenchmark() {
  return useQuery({
    queryKey: ["forecast", "benchmark"],
    queryFn: async () => unwrap(await api.GET("/v1/forecast/benchmark")),
    staleTime: Infinity,
  });
}
