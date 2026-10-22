import { describe, expect, it } from "vitest";

import { enqueue, flushOutbox, mergeAfterFlush, type OutboxItem, type SendResult } from "../src/outbox";

const producer = (id: string, queuedAt: string): OutboxItem => ({
  kind: "producer", id, queuedAt,
  body: { full_name: "Awa Diatta", village: "Bambali", zone: "Sédhiou", consent_given: true },
});
const harvest = (id: string, queuedAt: string): OutboxItem => ({
  kind: "harvest", id, queuedAt,
  body: { producer_id: "p1", harvest_date: "2026-06-10", quantity_kg: 800, rejected_kg: 0 },
});

describe("enqueue", () => {
  it("remplace une saisie en attente qui a le même identifiant", () => {
    const items = enqueue([producer("p1", "1")], { ...producer("p1", "2"), body: { ...producer("p1", "2").body, village: "Sédhiou" } } as OutboxItem);
    expect(items).toHaveLength(1);
    expect(items[0].queuedAt).toBe("2");
  });
});

describe("flushOutbox", () => {
  it("envoie les producteurs avant les collectes, puis dans l'ordre de saisie", async () => {
    const order: string[] = [];
    const { remaining, sent } = await flushOutbox([harvest("h1", "1"), producer("p2", "3"), producer("p1", "2")], async (item) => {
      order.push(item.id);
      return { status: "sent" };
    });
    expect(order).toEqual(["p1", "p2", "h1"]);
    expect(sent).toBe(3);
    expect(remaining).toEqual([]);
  });

  it("s'arrête sans réseau et garde tout ce qui n'est pas parti", async () => {
    const results: SendResult[] = [{ status: "sent" }, { status: "offline" }];
    const { remaining, sent, offline } = await flushOutbox(
      [producer("p1", "1"), producer("p2", "2"), harvest("h1", "3")],
      async () => results.shift() ?? { status: "sent" },
    );
    expect(offline).toBe(true);
    expect(sent).toBe(1);
    expect(remaining.map((i) => i.id)).toEqual(["p2", "h1"]);
  });

  it("garde une saisie refusée avec son motif, et une saisie à réessayer sans motif", async () => {
    const { remaining } = await flushOutbox([producer("p1", "1"), harvest("h1", "2")], async (item) =>
      item.kind === "producer" ? { status: "invalid", message: "zone inconnue" } : { status: "retry", message: "Erreur 409" },
    );
    expect(remaining).toMatchObject([{ id: "p1", error: "zone inconnue" }, { id: "h1", error: undefined }]);
  });
});

describe("mergeAfterFlush", () => {
  it("ne perd ni une saisie ajoutée pendant l'envoi, ni sa nouvelle version", () => {
    const snapshot = [producer("p1", "1"), harvest("h1", "2")];
    // Pendant l'envoi : h2 saisie, p1 corrigée par l'agent (nouvelle version), h1 inchangée
    const current = [harvest("h1", "2"), harvest("h2", "3"), producer("p1", "4")];
    // h1 est partie ; p1 était encore en attente (refus) mais sa nouvelle version gagne
    const merged = mergeAfterFlush(snapshot, [producer("p1", "1")], current);
    expect(merged.map((i) => `${i.id}@${i.queuedAt}`).sort()).toEqual(["h2@3", "p1@4"]);
  });
});
