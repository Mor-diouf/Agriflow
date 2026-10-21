import { useEffect, useRef, useState } from "react";

/** Valeur stabilisée après `delayMs` sans changement (recherche, curseurs) : évite un appel API par frappe. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/** Largeur rendue d'un élément, pour dessiner les graphiques SVG à la bonne taille (sans mise à l'échelle du texte). */
export function useElementWidth<E extends HTMLElement>(fallback = 720) {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    // jsdom (tests) n'implémente pas ResizeObserver : on garde la largeur par défaut
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
