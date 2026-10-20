import { Link } from "@tanstack/react-router";
import { BarChart3, Bot, Boxes, ChartNoAxesCombined, CloudSun, Gauge, Leaf, Route, Settings, UsersRound, type LucideIcon } from "lucide-react";

export type NavKey = "module1" | "module2" | "module3" | "analytics" | "reports" | "assistant" | "settings";
type AgriFlowNavProps = { active: NavKey; mobile?: boolean };
type NavItem = { label: string; icon: LucideIcon; to?: "/module1" | "/module2" | "/module3" | "/analytics" | "/reports" | "/assistant" | "/settings"; key?: NavKey };
const groups: { label: string; items: NavItem[] }[] = [
  { label: "COMMAND CENTER", items: [{ label: "Overview", icon: Gauge, to: "/module1", key: "module1" }] },
  { label: "OPERATIONS", items: [
    { label: "Collection Optimization", icon: Route, to: "/module1" as const, key: "module1" },
    { label: "Producer Intelligence", icon: UsersRound, to: "/module2" as const, key: "module2" },
    { label: "Harvest Forecast", icon: CloudSun, to: "/module3" as const, key: "module3" },
  ]},
  { label: "INTELLIGENCE", items: [{ label: "Analytics", icon: BarChart3, to: "/analytics" as const, key: "analytics" }, { label: "Reports", icon: ChartNoAxesCombined, to: "/reports" as const, key: "reports" }, { label: "AI Assistant", icon: Bot, to: "/assistant" as const, key: "assistant" }] },
  { label: "SYSTEM", items: [{ label: "Settings", icon: Settings, to: "/settings" as const, key: "settings" }] },
];

export function AgriFlowNav({ active, mobile = false }: AgriFlowNavProps) {
  return <div className={mobile ? "h-full bg-sidebar p-5" : "producer-sidebar"}>
    <div className="flex items-center gap-3 border-b border-sidebar-border pb-5">
      <span className="brand-mark"><Leaf className="size-4"/></span>
      <div><p className="font-display text-sm font-semibold">AGRIFLOW</p><p className="text-[10px] text-muted-foreground">SM10 CONNECT</p></div>
      <span className="ml-auto rounded border border-primary/30 px-1.5 py-0.5 font-mono text-[9px] text-primary">{active.toUpperCase().replace("MODULE", "M")}</span>
    </div>
    <nav className="mt-6 space-y-6" aria-label="Navigation principale">
      {groups.map((group) => <div key={group.label}>
        <p className="mb-2 px-2 font-mono text-[9px] text-muted-foreground">{group.label}</p>
        <div className="space-y-1">{group.items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          if (item.to) return <Link key={item.label} to={item.to} className={`producer-nav-item ${isActive ? "producer-nav-active" : ""}`}><Icon className="size-4"/><span>{item.label}</span>{isActive && <span className="ml-auto size-1.5 rounded-full bg-primary"/>}</Link>;
          return <span key={item.label} className="producer-nav-item cursor-not-allowed opacity-45" title="Module à venir"><Icon className="size-4"/><span>{item.label}</span></span>;
        })}</div>
      </div>)}
    </nav>
    <div className="mt-auto border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Boxes className="size-3.5 text-primary"/>ANALYTICS ENGINE <span className="ml-auto text-primary">ACTIVE</span></div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-muted-foreground"><span>DATA STATUS</span><span className="border border-secondary-route/30 px-1.5 py-0.5 text-secondary-route">DEMO DATA</span></div>
    </div>
  </div>;
}
