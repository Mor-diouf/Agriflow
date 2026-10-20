/** Données de démonstration réalistes du corridor mangue en Casamance. */
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

export const USINE = { nom: "Parc SM10 Agro", ville: "Bambali", x: 58, y: 42 };

export const FERMES: Ferme[] = [
  { id: "P-01", nom: "Coop. Bignona", zone: "Bignona", x: 19, y: 30, volume: 18.4, distance: 94, optimisee: true, collecte: "07:20", tournee: "TRK-001" },
  { id: "P-02", nom: "Verger Tenghory", zone: "Tenghory", x: 25, y: 38, volume: 12.1, distance: 82, optimisee: true, collecte: "07:45", tournee: "TRK-001" },
  { id: "P-03", nom: "GIE Diouloulou", zone: "Diouloulou", x: 11, y: 22, volume: 9.7, distance: 126, optimisee: false, collecte: "08:10", tournee: "TRK-003" },
  { id: "P-04", nom: "Union Ziguinchor", zone: "Ziguinchor", x: 25, y: 60, volume: 21.8, distance: 103, optimisee: true, collecte: "08:25", tournee: "TRK-004" },
  { id: "P-05", nom: "Coop. Marsassoum", zone: "Marsassoum", x: 45, y: 54, volume: 14.3, distance: 42, optimisee: true, collecte: "07:55", tournee: "TRK-004" },
  { id: "P-06", nom: "Producteurs Sédhiou", zone: "Sédhiou", x: 57, y: 58, volume: 20.6, distance: 27, optimisee: true, collecte: "08:05", tournee: "TRK-002" },
  { id: "P-07", nom: "Verger Goudomp", zone: "Goudomp", x: 50, y: 70, volume: 11.2, distance: 55, optimisee: false, collecte: "09:15", tournee: "TRK-006" },
  { id: "P-08", nom: "GIE Kolda", zone: "Kolda", x: 79, y: 61, volume: 19.6, distance: 91, optimisee: true, collecte: "09:40", tournee: "TRK-003" },
  { id: "P-09", nom: "Coop. Médina Yoro", zone: "Médina Yoro Foulah", x: 77, y: 31, volume: 14.9, distance: 117, optimisee: true, collecte: "09:20", tournee: "TRK-003" },
  { id: "P-10", nom: "Verger Vélingara", zone: "Vélingara", x: 92, y: 69, volume: 8.3, distance: 164, optimisee: false, collecte: "10:35", tournee: "TRK-005" },
  { id: "P-11", nom: "Producteurs Tanaff", zone: "Tanaff", x: 62, y: 76, volume: 6.4, distance: 70, optimisee: true, collecte: "09:05", tournee: "TRK-006" },
  { id: "P-12", nom: "GIE Bounkiling", zone: "Bounkiling", x: 57, y: 23, volume: 13.7, distance: 52, optimisee: true, collecte: "08:35", tournee: "TRK-002" },
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
};

export const CAMIONS: Camion[] = [
  { id: "TRK-001", chauffeur: "M. Diatta", itineraire: "Bignona → Bambali", arrets: 4, depart: "06:15", arrivee: "09:04", duree: "2h49", charge: 8.8, capacite: 10, statut: "En route", optimisee: true, vitesse: 54, priorite: "Normale" },
  { id: "TRK-002", chauffeur: "A. Sambou", itineraire: "Sédhiou → Bambali", arrets: 3, depart: "06:40", arrivee: "08:22", duree: "1h42", charge: 9.4, capacite: 10, statut: "Chargement", optimisee: true, vitesse: 0, priorite: "Haute" },
  { id: "TRK-003", chauffeur: "I. Baldé", itineraire: "Kolda → Bambali", arrets: 5, depart: "07:00", arrivee: "10:36", duree: "3h36", charge: 11.6, capacite: 14, statut: "En route", optimisee: false, vitesse: 47, priorite: "Haute" },
  { id: "TRK-004", chauffeur: "S. Mané", itineraire: "Marsassoum → Bambali", arrets: 2, depart: "07:25", arrivee: "08:51", duree: "1h26", charge: 7.6, capacite: 8, statut: "Retour usine", optimisee: true, vitesse: 51, priorite: "Normale" },
  { id: "TRK-005", chauffeur: "L. Touré", itineraire: "Vélingara → Bambali", arrets: 4, depart: "08:05", arrivee: "12:18", duree: "4h13", charge: 12.9, capacite: 14, statut: "En route", optimisee: false, vitesse: 39, priorite: "Critique" },
  { id: "TRK-006", chauffeur: "F. Cissé", itineraire: "Goudomp → Bambali", arrets: 3, depart: "08:30", arrivee: "10:25", duree: "1h55", charge: 7.4, capacite: 10, statut: "Chargement", optimisee: true, vitesse: 0, priorite: "Normale" },
];

export const TEMPS_TOURNEES = [
  { camion: "001", optimise: 2.82, reference: 3.4 }, { camion: "002", optimise: 1.7, reference: 2.3 },
  { camion: "003", optimise: 3.6, reference: 4.4 }, { camion: "004", optimise: 1.43, reference: 2.1 },
  { camion: "005", optimise: 4.22, reference: 5.0 }, { camion: "006", optimise: 1.92, reference: 2.7 },
];

export const PERTES_24H = [
  { heure: "1h", pertes: 0.04 }, { heure: "4h", pertes: 0.11 }, { heure: "7h", pertes: 0.19 },
  { heure: "10h", pertes: 0.27 }, { heure: "13h", pertes: 0.36 }, { heure: "16h", pertes: 0.44 },
  { heure: "19h", pertes: 0.51 }, { heure: "24h", pertes: 0.58 },
];

export const CAPACITE = [
  { nom: "Charge utilisée", valeur: 87.5, couleur: "var(--color-optimized)" },
  { nom: "Marge disponible", valeur: 12.5, couleur: "var(--color-secondary-route)" },
];

export const JOURNAL = [
  { camion: "TRK-001", texte: "Bignona collecté, direction Bambali", km: "68 km", optimisee: true },
  { camion: "TRK-003", texte: "Desserte Kolda recalculée", km: "+8 km", optimisee: false },
  { camion: "TRK-005", texte: "Fenêtre de Vélingara confirmée", km: "164 km", optimisee: false },
  { camion: "TRK-004", texte: "Arrivée au parc dans 12 min", km: "9 km", optimisee: true },
];

export const KPI = {
  tempsTotal: "15h 42m", tempsDelta: "−12,8 %", camions: CAMIONS.length,
  capaciteMoy: 87.5, capaciteMax: 95, capaciteMin: 76, pertesEvitees: 94.2,
  pertesEstimees: 0.58, volumeCollecte: FERMES.reduce((s, f) => s + f.volume, 0), distanceTotale: 974,
};