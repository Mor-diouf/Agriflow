import { api, unwrap, type FieldProducer, type HarvestRecord } from "@agriflow/api-client";
import { useQuery } from "@tanstack/react-query";

import { readJson, writeJson } from "./storage";

/**
 * Données du serveur gardées sur le téléphone : sans réseau au démarrage, l'agent retrouve
 * les producteurs et les zones de sa dernière connexion.
 */
function useCachedQuery<T>(key: string, fetcher: () => Promise<T>) {
  const storageKey = `agriflow.collecte.cache.${key}`;
  return useQuery({
    queryKey: ["field", key],
    queryFn: async () => {
      const data = await fetcher();
      writeJson(storageKey, data);
      return data;
    },
    initialData: () => readJson<T | undefined>(storageKey, undefined),
    // Les données gardées sont affichées tout de suite, puis rafraîchies dès que possible
    initialDataUpdatedAt: 0,
    retry: false,
  });
}

export const useFieldZones = () =>
  useCachedQuery("zones", async () => unwrap(await api.GET("/v1/config")).zones);

export const useFieldProducers = () =>
  useCachedQuery<FieldProducer[]>("producteurs", async () => unwrap(await api.GET("/v1/field/producers")));

export const useRecentHarvests = () =>
  useCachedQuery<HarvestRecord[]>("collectes", async () =>
    unwrap(await api.GET("/v1/field/harvests", { params: { query: { limit: 30 } } })),
  );
