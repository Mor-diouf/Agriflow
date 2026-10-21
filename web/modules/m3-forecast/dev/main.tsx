import "@agriflow/ui/styles.css";

import { AppShell, PlainLink } from "@agriflow/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ForecastPage } from "../src";

// Bac à sable : le module M3 seul, dans la coque commune, sans la plateforme.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell
        items={[{ code: "M3", label: "Prévisions", href: "/" }]}
        isActive={() => true}
        Link={PlainLink}
      >
        <ForecastPage />
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);
