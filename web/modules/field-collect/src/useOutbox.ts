import { api } from "@agriflow/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { enqueue, flushOutbox, loadOutbox, mergeAfterFlush, saveOutbox, type OutboxItem, type SendResult } from "./outbox";

/** Message lisible d'un refus de validation FastAPI (422). */
function describeRejection(error: unknown): string {
  const detail = (error as { detail?: unknown } | undefined)?.detail;
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg ?? "").filter(Boolean).join(" ; ");
  return typeof detail === "string" ? detail : "Saisie refusée par le serveur";
}

async function send(item: OutboxItem): Promise<SendResult> {
  try {
    const { response, error } =
      item.kind === "producer"
        ? await api.PUT("/v1/field/producers/{producer_id}", { params: { path: { producer_id: item.id } }, body: item.body })
        : await api.PUT("/v1/field/harvests/{harvest_id}", { params: { path: { harvest_id: item.id } }, body: item.body });
    if (response.ok) return { status: "sent" };
    if (response.status === 422) return { status: "invalid", message: describeRejection(error) };
    return { status: "retry", message: `Erreur ${response.status}` };
  } catch {
    return { status: "offline" };
  }
}

/**
 * File des saisies en attente, gardée sur le téléphone. Envoi automatique à l'ouverture,
 * après chaque saisie et au retour du réseau ; « Envoyer maintenant » le relance à la main.
 */
export function useOutbox() {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<OutboxItem[]>(loadOutbox);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const current = useRef(items);
  const busy = useRef(false);
  // Une saisie arrivée pendant un envoi en relance un autre juste après
  const rerun = useRef(false);

  const persist = useCallback((next: OutboxItem[]) => {
    current.current = next;
    saveOutbox(next);
    setItems(next);
  }, []);

  const sync = useCallback(async () => {
    if (busy.current) {
      rerun.current = true;
      return;
    }
    if (current.current.length === 0) return;
    busy.current = true;
    setSyncing(true);
    let offline = false;
    do {
      rerun.current = false;
      const snapshot = current.current;
      const result = await flushOutbox(snapshot, send);
      offline = result.offline;
      persist(mergeAfterFlush(snapshot, result.remaining, current.current));
      if (result.sent > 0) {
        setLastSentAt(new Date());
        await queryClient.invalidateQueries({ queryKey: ["field"] });
      }
    } while (rerun.current && !offline);
    setOnline(!offline);
    busy.current = false;
    setSyncing(false);
  }, [persist, queryClient]);

  const add = useCallback(
    (item: OutboxItem) => {
      persist(enqueue(current.current, item));
      void sync();
    },
    [persist, sync],
  );

  useEffect(() => {
    void sync();
    const goOnline = () => {
      setOnline(true);
      void sync();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [sync]);

  return { items, add, sync, syncing, online, lastSentAt };
}
