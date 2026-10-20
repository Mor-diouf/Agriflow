import "@agriflow/ui/styles.css";

import { AppShell, PlainLink } from "@agriflow/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ProducersPage } from "../src";

// Bac à sable : le module M2 seul, dans la coque commune, sans la plateforme.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell
        items={[{ code: "M2", label: "Producteurs", href: "/" }]}
        isActive={() => true}
        Link={PlainLink}
      >
        <ProducersPage />
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);
