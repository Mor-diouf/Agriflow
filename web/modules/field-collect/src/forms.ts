/** « 3,5 » ou « 3.5 » → 3,5 ; vide → undefined ; illisible → NaN. */
export function parseNumber(text: string): number | undefined {
  const cleaned = text.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : Number.NaN;
}

/** Date du jour du téléphone, au format AAAA-MM-JJ (heure locale, pas UTC). */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type Errors<K extends string> = Partial<Record<K, string>>;

export const hasErrors = (errors: Errors<string>) => Object.values(errors).some(Boolean);
