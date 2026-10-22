import type { FieldProducerIn, HarvestRecordIn } from "@agriflow/api-client";

import { readJson, writeJson } from "./storage";

/** Saisie faite sur le téléphone, en attente d'envoi au serveur. */
export type OutboxItem =
  | { kind: "producer"; id: string; body: FieldProducerIn; queuedAt: string; error?: string }
  | { kind: "harvest"; id: string; body: HarvestRecordIn; queuedAt: string; error?: string };

/**
 * Résultat d'un envoi :
 * - offline : pas de réseau, on arrête et on réessaiera plus tard ;
 * - retry : refus passager (serveur indisponible, producteur pas encore reçu), on réessaiera ;
 * - invalid : saisie refusée, l'agent doit la corriger.
 */
export type SendResult = { status: "sent" } | { status: "offline" } | { status: "retry" | "invalid"; message: string };

const STORAGE_KEY = "agriflow.collecte.envois.v1";

export const loadOutbox = (): OutboxItem[] => readJson<OutboxItem[]>(STORAGE_KEY, []);
export const saveOutbox = (items: OutboxItem[]) => writeJson(STORAGE_KEY, items);

const sameItem = (a: OutboxItem, b: OutboxItem) => a.kind === b.kind && a.id === b.id;

/** Ajoute une saisie ; une nouvelle version d'une saisie en attente la remplace (même identifiant). */
export function enqueue(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  return [...items.filter((i) => !sameItem(i, item)), item];
}

/**
 * Envoie les saisies en attente : les fiches producteurs d'abord (un relevé exige que son
 * producteur soit connu du serveur), puis les relevés, dans l'ordre de saisie.
 */
export async function flushOutbox(
  items: OutboxItem[],
  send: (item: OutboxItem) => Promise<SendResult>,
): Promise<{ remaining: OutboxItem[]; sent: number; offline: boolean }> {
  const ordered = [...items].sort(
    (a, b) => Number(a.kind === "harvest") - Number(b.kind === "harvest") || a.queuedAt.localeCompare(b.queuedAt),
  );
  const remaining: OutboxItem[] = [];
  let sent = 0;
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const result = await send(item);
    if (result.status === "sent") {
      sent++;
    } else if (result.status === "offline") {
      // Sans réseau, inutile d'essayer les suivantes
      return { remaining: [...remaining, ...ordered.slice(i)], sent, offline: true };
    } else {
      remaining.push({ ...item, error: result.status === "invalid" ? result.message : undefined });
    }
  }
  return { remaining, sent, offline: false };
}

/**
 * Fusionne la file restante après un envoi avec les saisies ajoutées pendant celui-ci :
 * une saisie (ou nouvelle version) arrivée entre-temps n'est jamais perdue.
 */
export function mergeAfterFlush(snapshot: OutboxItem[], remaining: OutboxItem[], current: OutboxItem[]): OutboxItem[] {
  const unchanged = (item: OutboxItem) => snapshot.some((s) => sameItem(s, item) && s.queuedAt === item.queuedAt);
  const addedMeanwhile = current.filter((item) => !unchanged(item));
  return [...remaining.filter((r) => !addedMeanwhile.some((a) => sameItem(a, r))), ...addedMeanwhile];
}
