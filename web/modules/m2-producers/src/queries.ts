import { api, unwrap, type ProducerQuery } from "@agriflow/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function usePlatformConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => unwrap(await api.GET("/v1/config")),
    staleTime: Infinity,
  });
}

export function useProducerSummary() {
  return useQuery({
    queryKey: ["producers", "summary"],
    queryFn: async () => unwrap(await api.GET("/v1/producers/summary")),
  });
}

export function useProducers(query: ProducerQuery) {
  return useQuery({
    queryKey: ["producers", "list", query],
    queryFn: async () => unwrap(await api.GET("/v1/producers", { params: { query } })),
    // Garde la page précédente affichée pendant le chargement de la suivante
    placeholderData: keepPreviousData,
  });
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
