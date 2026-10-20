import type { DataStatus } from "@/lib/forecast/types";

const LABELS: Record<DataStatus | "projet", { text: string; cls: string }> = {
  reel: { text: "DONNÉE RÉELLE", cls: "dl-reel" },
  projet: { text: "DONNÉE PROJET", cls: "dl-reel" },
  simule: { text: "SIMULÉ", cls: "dl-simule" },
  hypothese: { text: "HYPOTHÈSE", cls: "dl-hypothese" },
  modele: { text: "SORTIE DU MODÈLE", cls: "dl-modele" },
  a_obtenir: { text: "À OBTENIR", cls: "dl-obtenir" },
};

export function DataLabel({ status, title }: { status: DataStatus | "projet"; title?: string }) {
  const l = LABELS[status];
  return <span className={`data-label ${l.cls}`} title={title ?? l.text}><i />{l.text}</span>;
}

export function DataLegend() {
  return <div className="flex flex-wrap gap-1.5">{(["reel", "simule", "hypothese", "modele", "a_obtenir"] as const).map((s) => <DataLabel key={s} status={s} />)}</div>;
}
