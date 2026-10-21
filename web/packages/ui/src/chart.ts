/** Pas de graduation « rond » donnant au plus 5 intervalles entre 0 et `max`. */
export function niceStep(max: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]) {
    if (max / step <= 5) return step;
  }
  return Math.ceil(max / 5000) * 1000;
}

/** Graduations de 0 au premier multiple du pas qui couvre `max` : [0, pas, 2 × pas, …]. */
export function niceTicks(max: number): number[] {
  const step = niceStep(max);
  const count = Math.max(1, Math.ceil(max / step));
  return Array.from({ length: count + 1 }, (_, i) => i * step);
}
