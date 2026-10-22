import { api, unwrap } from "@agriflow/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => unwrap(await api.GET("/v1/config")),
    staleTime: Infinity,
  });
}

/**
 * Prévisions d'une saison faites `horizon` semaines à l'avance, pour toutes les zones : le choix
 * de la zone se fait dans la page, sans nouvel appel.
 */
export function useSeasonForecast(year: number | undefined, horizon: number) {
  return useQuery({
    queryKey: ["forecast", year ?? null, horizon],
    queryFn: async () => unwrap(await api.GET("/v1/forecast", { params: { query: { year, horizon } } })),
    enabled: year !== undefined,
    // Résultats déterministes (seed fixe) : une saison déjà chargée n'est pas redemandée
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

/** Performances de tous les modèles à tous les horizons : un seul appel, filtré dans la page. */
export function useModelBenchmark() {
  return useQuery({
    queryKey: ["forecast", "benchmark"],
    queryFn: async () => unwrap(await api.GET("/v1/forecast/benchmark")),
    staleTime: Infinity,
  });
}
