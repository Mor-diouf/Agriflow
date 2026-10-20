import { useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

export type Tone = "forest" | "slate" | "mango" | "danger";

function cx(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Boutons ────────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "attention";
};

export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx("af-btn", `af-btn--${variant}`, className)} {...rest} />;
}

export function IconButton({ label, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className="af-icon-btn" aria-label={label} {...rest}>
      {children}
    </button>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────

export function Badge({ tone, dot = true, children }: { tone: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`af-badge af-badge--${tone}`}>
      {dot && <span className="af-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

// ─── Cartes ─────────────────────────────────────────────────────────────────

export function Card({ padded = false, className, children, ...rest }: { padded?: boolean; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("af-card", padded && "af-card--padded", className)} {...rest}>
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  detail,
  detailTone,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  detailTone?: "positive" | "danger";
  loading?: boolean;
}) {
  return (
    <div className="af-card af-kpi">
      <div className="af-eyebrow">{label}</div>
      {loading ? (
        <Skeleton width="60%" height={36} />
      ) : (
        <div className="af-kpi__value">
          {value} {unit && <span className="af-kpi__unit">{unit}</span>}
        </div>
      )}
      {detail && (
        <div className={cx("af-kpi__detail", detailTone && `af-kpi__detail--${detailTone}`)}>{detail}</div>
      )}
    </div>
  );
}

// ─── Bandeau ────────────────────────────────────────────────────────────────

export function Notice({ tone = "attention", children }: { tone?: "attention" | "danger"; children: ReactNode }) {
  return (
    <div className={`af-notice af-notice--${tone}`} role={tone === "danger" ? "alert" : "note"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

// ─── Onglets segmentés ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="af-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="af-segmented__item"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Recherche ──────────────────────────────────────────────────────────────

export function SearchInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="af-search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ color: "var(--af-muted)" }}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <span className="af-sr-only">{label}</span>
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// ─── Jauge ──────────────────────────────────────────────────────────────────

export function Meter({ value, max = 100, children }: { value: number; max?: number; children?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="af-meter">
      <div className="af-meter__track" aria-hidden="true">
        <div className="af-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      {children}
    </div>
  );
}

// ─── Squelette ──────────────────────────────────────────────────────────────

export function Skeleton({ width = "100%", height = 14 }: { width?: string | number; height?: number }) {
  return <span className="af-skeleton" style={{ width, height }} aria-hidden="true" />;
}

// ─── Panneau latéral (dialog natif : focus, Échap et fond gérés par le navigateur) ──

export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="af-drawer"
      aria-labelledby="af-drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="af-drawer__inner">
          <div className="af-drawer__header">
            <div>
              {eyebrow && <div className="af-eyebrow">{eyebrow}</div>}
              <h2 id="af-drawer-title" className="af-drawer__title">{title}</h2>
            </div>
            <IconButton label="Fermer" onClick={onClose}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
