import type { ReactNode } from "react";
import { useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { AgriFlowNav, type NavKey } from "@/components/AgriFlowNav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type Props = { active: NavKey; code: string; title: string; subtitle: string; status: string; children: ReactNode; actions?: ReactNode };
export function EnterpriseShell({ active, code, title, subtitle, status, children, actions }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => { setRefreshing(true); window.setTimeout(() => setRefreshing(false), 900); };
  return <div className="producer-app min-h-screen bg-background text-foreground">
    <aside className="hidden lg:block"><AgriFlowNav active={active}/></aside>
    <main className="producer-main">
      <header className="producer-header">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setNavOpen(true)} aria-label="Ouvrir la navigation"><Menu/></Button>
          <div className="min-w-0"><p className="font-mono text-[9px] text-primary">{code}</p><h1 className="truncate text-xl font-semibold sm:text-2xl">{title}</h1><p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="icon" onClick={refresh} title="Actualiser"><RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`}/></Button>{actions}</div>
      </header>
      <div className="producer-content">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3"><div className="flex items-center gap-2"><span className="live-label">{status}</span><span className="demo-badge">DATA STATUS — DEMO DATA</span></div><p className="hidden font-mono text-[9px] text-muted-foreground sm:block">SYNCHRONISATION · 22 SEP 2026 · 12:38 UTC</p></div>
        {children}
        <footer className="flex items-center justify-between py-4 text-[9px] text-muted-foreground"><span>AGRIFLOW · SM10 CONNECT</span><span>DEMO DATA · NOT FOR OPERATIONAL DECISIONS</span></footer>
      </div>
    </main>
    <Sheet open={navOpen} onOpenChange={setNavOpen}><SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0"><SheetTitle className="sr-only">Navigation AGRIFLOW</SheetTitle><AgriFlowNav active={active} mobile/></SheetContent></Sheet>
  </div>;
}

export function Metric({ label, value, unit, detail, tone="normal" }: { label:string; value:string; unit?:string; detail:string; tone?:"normal"|"good"|"warning" }) {
  return <article className="ops-metric"><div className="flex items-start justify-between gap-2"><p>{label}</p><i className={`metric-state metric-${tone}`}/></div><div className="mt-3 font-mono"><b>{value}</b>{unit && <span>{unit}</span>}</div><small>{detail}</small></article>;
}

export function Section({ eyebrow, title, aside, children, className="" }: { eyebrow:string; title:string; aside?:ReactNode; children:ReactNode; className?:string }) {
  return <section className={`analytics-section ${className}`}><div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{aside}</div>{children}</section>;
}

export function LineChart({ series, labels, secondary }: { series:number[]; labels:string[]; secondary?:number[] }) {
  const points=(data:number[])=>data.map((v,i)=>`${28+i*(430/Math.max(1,data.length-1))},${142-(v/Math.max(...series,...(secondary??[]),1))*112}`).join(" ");
  return <svg viewBox="0 0 490 175" className="ops-chart"><g className="chart-grid">{[30,67,104,141].map(y=><line key={y} x1="28" x2="458" y1={y} y2={y}/>)}</g>{secondary&&<polyline points={points(secondary)} fill="none" stroke="var(--color-chart-3)" strokeWidth="2" strokeDasharray="5 5"/>}<polyline points={points(series)} fill="none" stroke="var(--color-primary)" strokeWidth="2.4"/>{series.map((v,i)=><circle key={i} cx={28+i*(430/Math.max(1,series.length-1))} cy={142-(v/Math.max(...series,...(secondary??[]),1))*112} r="3" fill="var(--color-primary)"/>)}{labels.map((label,i)=><text key={label} x={28+i*(430/Math.max(1,labels.length-1))} y="165" textAnchor="middle" className="chart-label">{label}</text>)}</svg>;
}
