import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => { throw redirect({ to: "/module1" }); },
  head: () => ({
    meta: [
      { title: "AgriFlow — Plateforme logistique de la filière mangue" },
      {
        name: "description",
        content:
          "AgriFlow relie la collecte des producteurs à l'usine de transformation : optimisation des tournées, segmentation des producteurs et prévision des récoltes.",
      },
      { property: "og:title", content: "AgriFlow — Plateforme logistique de la filière mangue" },
      {
        property: "og:description",
        content:
          "Optimisation des tournées de collecte agricole, du volume disponible jusqu'à l'usine de transformation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => null,
});
