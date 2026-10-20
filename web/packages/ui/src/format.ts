/** Formats numériques français, partagés par tous les modules (espace insécable des milliers, virgule décimale). */

const cache = new Map<number, Intl.NumberFormat>();

export function formatNumber(value: number, decimals = 0): string {
  let fmt = cache.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    cache.set(decimals, fmt);
  }
  return fmt.format(value);
}

/** 0,4312 → « 43 » ; pour les ratios 0-1 affichés en pourcentage ou sur 100. */
export function formatRatio(value: number, decimals = 0): string {
  return formatNumber(value * 100, decimals);
}
