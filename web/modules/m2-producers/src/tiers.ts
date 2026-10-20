import type { PriorityTier } from "@agriflow/api-client";
import type { Tone } from "@agriflow/ui";

/** Présentation des niveaux de priorité (docs/DECISIONS.md, D2), dans l'ordre de l'API. */
export const TIERS: { value: PriorityTier; label: string; tone: Tone; color: string }[] = [
  { value: "prioritaire", label: "Prioritaire", tone: "forest", color: "var(--af-forest-600)" },
  { value: "standard", label: "Standard", tone: "slate", color: "var(--af-slate-500)" },
  { value: "a_surveiller", label: "À surveiller", tone: "mango", color: "var(--af-mango-500)" },
];

export const tierMeta = (tier: PriorityTier) => TIERS.find((t) => t.value === tier)!;

/** Au-delà de ce taux de rejet, la livraison est signalée : le score actuel ignore la qualité. */
export const HIGH_REJECTION_RATE = 0.15;
