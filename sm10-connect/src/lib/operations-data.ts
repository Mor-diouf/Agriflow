export const FORECAST_ZONES = [
  {zone:"Bignona", forecast:8240, confirmed:7080, confidence:91, peak:"Semaine 24", rain:118, alert:"Stable"},
  {zone:"Ziguinchor", forecast:7160, confirmed:6320, confidence:89, peak:"Semaine 25", rain:132, alert:"Stable"},
  {zone:"Sédhiou", forecast:10840, confirmed:8860, confidence:86, peak:"Semaine 26", rain:104, alert:"Surveillance"},
  {zone:"Kolda", forecast:9430, confirmed:7510, confidence:83, peak:"Semaine 27", rain:91, alert:"Surveillance"},
  {zone:"Oussouye", forecast:5160, confirmed:3910, confidence:88, peak:"Semaine 25", rain:124, alert:"Surveillance"},
  {zone:"Bambali", forecast:2380, confirmed:2040, confidence:93, peak:"Semaine 24", rain:126, alert:"Stable"},
];
export const MONTHLY_FORECAST=[18.2,22.8,31.4,43.2,39.8,27.1,14.6];
export const MONTHLY_ACTUAL=[17.3,21.9,29.8,0,0,0,0];
export const ANALYTICS_ZONES = [
  { zone: "Bignona", volume: 48.2, service: 96.5, risk: 8.2, quality: 92, cost: 138 },
  { zone: "Sédhiou", volume: 44.6, service: 94.2, risk: 11.4, quality: 89, cost: 146 },
  { zone: "Ziguinchor", volume: 36.8, service: 95.8, risk: 9.1, quality: 91, cost: 142 },
  { zone: "Kolda", volume: 38.4, service: 88.7, risk: 18.2, quality: 82, cost: 182 },
  { zone: "Oussouye", volume: 24.6, service: 92.1, risk: 12.8, quality: 88, cost: 164 },
  { zone: "Bambali", volume: 16.0, service: 98.5, risk: 5.2, quality: 94, cost: 110 },
];
export const REPORTS = [
  { name: "Rapport Exécutif Phase I — Architecture Tri-Niveaux (SARIMAX / Q0.75 / Q0.90)", type: "Module 3", period: "2022-2025 OOS", owner: "Data Science & M3", status: "Prêt", updated: "24 sept. · 01:45" },
  { name: "Plan d'Optimisation des Tournées PuLP (VRP 202 km vs 286 km baseline)", type: "Module 1", period: "Campagne Active", owner: "Logistique & Flotte", status: "Prêt", updated: "24 sept. · 11:30" },
  { name: "Audit de Segmentation Multicritère K-Means (100 Producteurs, Profils A & B)", type: "Module 2", period: "Scoring Annuel", owner: "Intelligence Agricole", status: "Prêt", updated: "23 sept. · 18:20" },
  { name: "Matrice d'Arbitrage des 4 Scénarios de Stress Usine & Flotte", type: "Module 4", period: "Temps Réel", owner: "Direction Générale", status: "Prêt", updated: "24 sept. · 16:50" },
  { name: "Diagnostic des Résidus & Autocorrélation SARIMAX (Phase H.1)", type: "Module 3", period: "1 040 obs OOS", owner: "Modélisation Risque", status: "Prêt", updated: "23 sept. · 20:15" },
];
