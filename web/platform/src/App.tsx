import { ProducersPage } from "@agriflow/m2-producers";
import { AppShell, Card, PageHeader, type LinkComponent, type NavItem } from "@agriflow/ui";
import { Link as RouterLink, Navigate, Route, Routes, useLocation } from "react-router";

/** Les modules de la plateforme. Un module passe de « bientôt » à actif dès que son package est branché ici. */
const MODULES: NavItem[] = [
  { code: "M1", label: "Tournées", href: "/tournees", soon: true },
  { code: "M2", label: "Producteurs", href: "/producteurs" },
  { code: "M3", label: "Prévisions", href: "/previsions", soon: true },
  { code: "M4", label: "Charge usine", href: "/charge-usine", soon: true },
  { code: "M5", label: "Copilote", href: "/copilote", soon: true },
];

const NavLink: LinkComponent = ({ href, className, active, disabled, children }) =>
  disabled ? (
    <span className={className} aria-disabled="true">
      {children}
    </span>
  ) : (
    <RouterLink to={href} className={className} aria-current={active ? "page" : undefined}>
      {children}
    </RouterLink>
  );

export function App() {
  const { pathname } = useLocation();

  return (
    <AppShell items={MODULES} isActive={(m) => pathname.startsWith(m.href)} Link={NavLink}>
      <Routes>
        <Route path="/" element={<Navigate to="/producteurs" replace />} />
        <Route path="/producteurs" element={<ProducersPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppShell>
  );
}

function NotFound() {
  return (
    <>
      <PageHeader eyebrow="AGRIFLOW" title="Page introuvable" />
      <Card padded>
        Ce module n'est pas encore disponible. <RouterLink to="/producteurs">Retour aux producteurs</RouterLink>
      </Card>
    </>
  );
}
