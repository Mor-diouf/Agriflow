import type { ComponentType, ReactNode } from "react";

export type NavItem = {
  code: string;
  label: string;
  href: string;
  /** Module pas encore disponible : affiché mais non cliquable. */
  soon?: boolean;
};

/** Composant de lien fourni par l'hôte (ex. NavLink de react-router), pour que l'UI reste indépendante du routeur. */
export type LinkComponent = ComponentType<{
  href: string;
  className: string;
  active: boolean;
  disabled: boolean;
  children: ReactNode;
}>;

export function AppShell({
  items,
  isActive,
  Link,
  children,
}: {
  items: NavItem[];
  isActive: (item: NavItem) => boolean;
  Link: LinkComponent;
  children: ReactNode;
}) {
  return (
    <div className="af-shell">
      <nav className="af-nav" aria-label="Modules">
        <div className="af-nav__brand">
          <span className="af-nav__logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3c4.5 1.5 7 5 7 9.5S15.5 21 11 21 4 18 4 13.5C4 8 8 4 12 3Z" fill="#E8A317" />
            </svg>
          </span>
          AGRIFLOW
        </div>
        <ul className="af-nav__list">
          {items.map((item) => (
            <li key={item.code}>
              <Link href={item.href} className="af-nav__link" active={isActive(item)} disabled={!!item.soon}>
                <span className="af-nav__code">{item.code}</span>
                {item.label}
                {item.soon && <span className="af-nav__soon">bientôt</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="af-main">{children}</main>
    </div>
  );
}

/** Lien HTML simple, pour les hôtes sans routeur (bac à sable d'un module). */
export const PlainLink: LinkComponent = ({ href, className, active, disabled, children }) => (
  <a
    href={disabled ? undefined : href}
    className={className}
    aria-current={active ? "page" : undefined}
    aria-disabled={disabled || undefined}
  >
    {children}
  </a>
);

export function PageHeader({ eyebrow, title, actions }: { eyebrow: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <header className="af-page-header">
      <div>
        <div className="af-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
      </div>
      {actions && <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{actions}</div>}
    </header>
  );
}
