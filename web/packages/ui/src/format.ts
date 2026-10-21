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

/** « 4 172 t » : espace insécable avant l'unité, pour qu'elle ne passe jamais seule à la ligne. */
export function formatTonnes(value: number, decimals = 0): string {
  return `${formatNumber(value, decimals)} t`;
}

/** Ratio 0-1 en pourcentage : 0,129 → « 13 % ». */
export function formatPercent(value: number, decimals = 0): string {
  return `${formatRatio(value, decimals)} %`;
}

/** Valeur signée avec un vrai signe moins : « +1,2 t », « −0,5 % » ; sans signe si elle s'arrondit à zéro. */
export function formatSigned(value: number, decimals = 0, unit?: string): string {
  const magnitude = formatNumber(Math.abs(value), decimals);
  const sign = Math.round(Math.abs(value) * 10 ** decimals) === 0 ? "" : value > 0 ? "+" : "−";
  return `${sign}${magnitude}${unit ? ` ${unit}` : ""}`;
}
