import "@agriflow/ui/styles.css";

import { AppShell, PlainLink } from "@agriflow/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FieldCollectPage } from "../src";

// Bac à sable : la collecte terrain seule, dans la coque commune, sans la plateforme.
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell
        items={[{ code: "CT", label: "Collecte terrain", href: "/" }]}
        isActive={() => true}
        Link={PlainLink}
      >
        <FieldCollectPage />
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);
