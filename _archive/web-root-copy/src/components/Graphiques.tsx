/** Petits graphiques en SVG/CSS (sans dépendance de rendu conditionnel). */

export function BarresComparees({
  data,
}: {
  data: Array<{ camion: string; optimise: number; reference: number }>;
}) {
  const max = Math.max(...data.map((d) => d.reference)) * 1.1;
  return (
    <div className="flex h-28 items-end gap-2">
      {data.map((d) => (
        <div key={d.camion} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-24 w-full items-end justify-center gap-0.5">
            <div
              className="w-1/2 rounded-t-sm bg-muted"
              style={{ height: `${(d.reference / max) * 100}%` }}
              title={`Référence ${d.reference} h`}
            />
            <div
              className="w-1/2 rounded-t-sm bg-[var(--color-optimized)]"
              style={{ height: `${(d.optimise / max) * 100}%` }}
              title={`Optimisé ${d.optimise} h`}
            />
          </div>
          <span className="text-[9px] text-muted-foreground">{d.camion}</span>
        </div>
      ))}
    </div>
  );
}

export function Anneau({ valeur }: { valeur: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-32">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="12" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--color-optimized)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(valeur / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-lg font-semibold">{valeur} %</span>
      </div>
    </div>
  );
}

export function Courbe({ data }: { data: Array<{ heure: string; pertes: number }> }) {
  const max = Math.max(...data.map((d) => d.pertes));
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (d.pertes / max) * 88;
    return `${x},${y}`;
  });
  return (
    <div className="h-24">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full">
        <polyline
          points={`0,100 ${pts.join(" ")} 100,100`}
          fill="var(--color-optimized)"
          opacity="0.14"
        />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke="var(--color-optimized)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.heure}>{d.heure}</span>
        ))}
      </div>
    </div>
  );
}
