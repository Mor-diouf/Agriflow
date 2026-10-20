/**
 * Données réelles validées du solveur d'optimisation de tournées PuLP (Module 1).
 * Corridor logistique de la filière mangue en Casamance.
 */
import rawVrpData from "./data/module1_vrp_real.json";

export type Ferme = {
  id: string;
  nom: string;
  zone: string;
  x: number;
  y: number;
  volume: number;
  distance: number;
  optimisee: boolean;
  collecte: string;
  tournee: string;
};

export const USINE = {
  nom: rawVrpData.factory.name,
  ville: rawVrpData.factory.location,
  x: 58,
  y: 42,
  capaciteNominaleJour: rawVrpData.factory.nominal_daily_capacity_t,
};

export const FERMES: Ferme[] = [
  { id: "P003", nom: "Verger P003 (Bignona)", zone: "Bignona", x: 19, y: 30, volume: 3.2, distance: 94, optimisee: true, collecte: "07:15", tournee: "CAMION-01" },
  { id: "P005", nom: "GIE P005 (Bignona)", zone: "Bignona", x: 25, y: 38, volume: 2.8, distance: 82, optimisee: true, collecte: "08:30", tournee: "CAMION-01" },
  { id: "P007", nom: "Union P007 (Ziguinchor)", zone: "Ziguinchor", x: 25, y: 60, volume: 3.0, distance: 103, optimisee: true, collecte: "09:45", tournee: "CAMION-01" },
  { id: "P012", nom: "Verger P012 (Sédhiou)", zone: "Sédhiou", x: 57, y: 58, volume: 3.6, distance: 27, optimisee: true, collecte: "08:00", tournee: "CAMION-02" },
  { id: "P015", nom: "Coop P015 (Marsassoum)", zone: "Sédhiou", x: 45, y: 54, volume: 3.4, distance: 42, optimisee: true, collecte: "09:15", tournee: "CAMION-02" },
  { id: "P018", nom: "Verger P018 (Oussouye)", zone: "Oussouye", x: 14, y: 72, volume: 2.5, distance: 118, optimisee: true, collecte: "10:30", tournee: "STANDBY" },
  { id: "P022", nom: "GIE P022 (Kolda)", zone: "Kolda", x: 79, y: 61, volume: 4.1, distance: 91, optimisee: true, collecte: "10:00", tournee: "STANDBY" },
];

export type Camion = {
  id: string;
  chauffeur: string;
  itineraire: string;
  arrets: number;
  depart: string;
  arrivee: string;
  duree: string;
  charge: number;
  capacite: number;
  statut: "En route" | "Chargement" | "Retour usine";
  optimisee: boolean;
  vitesse: number;
  priorite: "Normale" | "Haute" | "Critique";
  typeCamion?: string;
  tauxPertePct?: number;
};

export const CAMIONS: Camion[] = [
  {
    id: "CAMION-01",
    chauffeur: "M. Diatta",
    itineraire: "Bignona → Ziguinchor → Usine Bambali",
    arrets: 3,
    depart: "06:00",
    arrivee: "11:30",
    duree: "5h30",
    charge: 9.0,
    capacite: 10.0,
    statut: "En route",
    optimisee: true,
    vitesse: 52,
    priorite: "Haute",
    typeCamion: "Isuzu FTR 10t (Frigorifique)",
    tauxPertePct: 2.1,
  },
  {
    id: "CAMION-02",
    chauffeur: "A. Sambou",
    itineraire: "Sédhiou → Marsassoum → Usine Bambali",
    arrets: 2,
    depart: "06:30",
    arrivee: "10:45",
    duree: "4h15",
    charge: 7.0,
    capacite: 8.0,
    statut: "En route",
    optimisee: true,
    vitesse: 48,
    priorite: "Normale",
    typeCamion: "Mercedes Atego 8t (Bâché)",
    tauxPertePct: 2.4,
  },
  {
    id: "CAMION-R3",
    chauffeur: "I. Baldé",
    itineraire: "Kolda → Usine Bambali (Réserve Pic)",
    arrets: 2,
    depart: "07:00",
    arrivee: "11:45",
    duree: "4h45",
    charge: 0.0,
    capacite: 10.0,
    statut: "Retour usine",
    optimisee: true,
    vitesse: 0,
    priorite: "Normale",
    typeCamion: "Isuzu FTR 10t (Standby)",
    tauxPertePct: 2.0,
  },
];

export const TEMPS_TOURNEES = [
  { camion: "CAMION-01", optimise: 5.5, reference: 7.8 },
  { camion: "CAMION-02", optimise: 4.25, reference: 5.9 },
  { camion: "CAMION-R3", optimise: 4.75, reference: 6.2 },
];

export const PERTES_24H = [
  { heure: "2h", pertes: 0.04 },
  { heure: "4h", pertes: 0.09 },
  { heure: "6h", pertes: 0.15 },
  { heure: "8h", pertes: 0.22 },
  { heure: "10h", pertes: 0.31 },
  { heure: "12h", pertes: 0.42 },
  { heure: "16h", pertes: 0.65 },
  { heure: "24h", pertes: 1.15 },
];

export const CAPACITE = [
  { nom: "Charge active", valeur: 88.9, couleur: "var(--color-optimized)" },
  { nom: "Marge restante", valeur: 11.1, couleur: "var(--color-secondary-route)" },
];

export const JOURNAL = [
  { camion: "CAMION-01", texte: "Arrêt P005 (Bignona) complété — 2.8 t chargées", km: "64 km", optimisee: true },
  { camion: "CAMION-02", texte: "Arrêt P012 (Sédhiou) complété — 3.6 t chargées", km: "27 km", optimisee: true },
  { camion: "CAMION-01", texte: "En transit vers P007 (Ziguinchor)", km: "88 km", optimisee: true },
  { camion: "CAMION-02", texte: "En transit vers P015 (Marsassoum)", km: "42 km", optimisee: true },
];

export const KPI = {
  tempsTotal: "9h 45m",
  tempsDelta: "−29.4 %",
  camions: 2,
  capaciteMoy: 88.9,
  capaciteMax: 90.0,
  capaciteMin: 87.5,
  pertesEvitees: rawVrpData.kpis.post_harvest_loss_avoided_t,
  pertesEstimees: rawVrpData.kpis.post_harvest_loss_t,
  volumeCollecte: rawVrpData.kpis.total_volume_collected_t,
  distanceTotale: rawVrpData.kpis.total_distance_km,
  distanceEconomisee: rawVrpData.kpis.distance_saved_km,
  carburantCFA: rawVrpData.kpis.fuel_cost_cfa,
  co2Kg: rawVrpData.kpis.co2_emissions_kg,
};