"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : data_generator.py

╔═══════════════════════════════════════════════════════════════════════╗
║  [DONNÉE SIMULÉE]                                                     ║
║  TOUTES LES DONNÉES PRODUITES PAR CE MODULE SONT SIMULÉES.           ║
║  Aucune ne provient de mesures réelles de terrain SM10 Agro.          ║
╚═══════════════════════════════════════════════════════════════════════╝

Génère des séries temporelles hebdomadaires réalistes de volumes de
récolte de mangues en Casamance (Sénégal), pour 5 zones géographiques
sur 5 saisons.

Architecture du générateur :
  1. Profils de zones (potentiel, tendance, saisonnalité, lag météo)
  2. Météo simulée (P, T, H) corrélée spatialement et temporellement
  3. Lien causal injecté : P_{t-ℓ*} → Y_{z,t}
  4. Modèle génératif multiplicatif :
       Y_{z,t} = μ_{z,a} · γ(w_t) · max(0, 1 + β_P · P̃_{t-ℓ*} + ε)

Choix du bruit multiplicatif (documenté, cf. cahier des charges §8) :
  La variance du volume croît naturellement avec le niveau moyen
  (hétéroscédasticité en production agricole). Le bruit multiplicatif
  garantit cette propriété et préserve la non-négativité.

Auteur  : Antigravity AI
Version : 1.0.0
Date    : 2026-09-22
=============================================================================
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass, asdict
from typing import List, Tuple, Dict


# ═══════════════════════════════════════════════════════════════════════════
# 1.  PROFIL D'UNE ZONE GÉOGRAPHIQUE
# ═══════════════════════════════════════════════════════════════════════════

# [DONNÉE SIMULÉE] — Noms réels des départements de Casamance ;
# les paramètres numériques associés sont entièrement simulés.
ZONE_NAMES = ['Bignona', 'Oussouye', 'Ziguinchor', 'Sédhiou', 'Kolda']


@dataclass
class ZoneParams:
    """
    Paramètres simulés d'une zone géographique.

    [DONNÉE SIMULÉE] — Les noms de zones correspondent aux départements
    réels de Casamance mais les valeurs numériques ne reflètent PAS les
    productions réelles.

    Symboles (cohérents avec le cahier mathématique) :
      μ̄_z   = base_potential_peak  (t/semaine au pic)
      δ_z   = annual_trend         (taux de croissance annuel)
      c_z   = season_center        (semaine du pic saisonnier)
      σ_z   = season_sigma         (largeur gaussienne, semaines)
      ℓ*_z  = optimal_lag          (retard météo optimal, semaines)
      β_P   = rain_sensitivity     (sensibilité aux précipitations)
      σ_ε   = noise_cv             (coefficient de variation du bruit)
    """
    name: str
    base_potential_peak: float   # μ̄_z  (tonnes/semaine au pic)
    annual_trend: float          # δ_z  (taux de croissance annuel)
    season_center: float         # c_z  (semaine du pic saisonnier)
    season_sigma: float          # σ_z  (largeur gaussienne)
    onset_base: float            # semaine de la transition d'entrée
    offset_base: float           # semaine de la transition de sortie
    optimal_lag: int             # ℓ*_z (retard météo optimal)
    rain_sensitivity: float      # β_P  (sensibilité précipitations)
    noise_cv: float              # σ_ε  (CV du bruit résiduel)
    latitude: float              # proxy latitude (°N) pour corrélation météo


def _generate_zone_params(
    n_zones: int,
    rng: np.random.Generator
) -> List[ZoneParams]:
    """
    Génère les profils simulés des zones géographiques.

    [DONNÉE SIMULÉE] — Paramètres tirés aléatoirement dans des plages
    réalistes pour la Casamance, non calibrés sur données réelles.

    Plages retenues et justifications :
    ┌──────────────────────┬────────────┬──────────────────────────────────┐
    │ Paramètre            │ Plage      │ Justification                    │
    ├──────────────────────┼────────────┼──────────────────────────────────┤
    │ Potentiel au pic     │ [25, 85]   │ Variabilité inter-zones réaliste │
    │ Tendance annuelle    │ [-1%, +5%] │ Croissance légère attendue       │
    │ Centre de saison     │ 28.5 ± 1.5 │ Mi-juillet ± 10 jours           │
    │ Largeur σ            │ [4.0, 5.5] │ Saison de 20-24 sem. à mi-haut. │
    │ Retard météo ℓ*      │ [5, 8]     │ Physiologie du manguier         │
    │ Sensibilité pluie β  │ [0.12,0.28]│ 12-28% de variation expliquée   │
    │ Bruit CV σ_ε         │ [0.06,0.12]│ 6-12% de variabilité résiduelle │
    │ Latitude             │ 12.0–13.6°N│ Étendue de la Casamance         │
    └──────────────────────┴────────────┴──────────────────────────────────┘
    """
    names = ZONE_NAMES[:n_zones]
    params = []

    for i, name in enumerate(names):
        params.append(ZoneParams(
            name=name,
            base_potential_peak=float(rng.uniform(25, 85)),
            annual_trend=float(rng.uniform(-0.01, 0.05)),
            season_center=float(28.5 + rng.uniform(-1.5, 1.5)),
            season_sigma=float(rng.uniform(4.0, 5.5)),
            onset_base=float(16.5 + rng.uniform(-0.5, 0.5)),
            offset_base=float(40.5 + rng.uniform(-0.5, 0.5)),
            optimal_lag=int(rng.integers(5, 9)),        # 5 à 8 inclus
            rain_sensitivity=float(rng.uniform(0.12, 0.28)),
            noise_cv=float(rng.uniform(0.06, 0.12)),
            latitude=float(12.0 + i * 0.4 + rng.uniform(-0.1, 0.1)),
        ))

    return params


# ═══════════════════════════════════════════════════════════════════════════
# 2.  PROFIL SAISONNIER (ENVELOPPE)
# ═══════════════════════════════════════════════════════════════════════════

def seasonal_envelope(
    week: np.ndarray,
    center: float,
    sigma: float,
    onset: float,
    offset: float,
    steepness: float = 2.0
) -> np.ndarray:
    """
    Profil saisonnier en forme de cloche avec transitions douces.

    Formulation :
        γ(w) = G(w; c, σ) · S_on(w; onset, k) · S_off(w; offset, k)

    Composantes :
      G(w)     = exp(-½((w-c)/σ)²)        enveloppe gaussienne (cloche)
      S_on(w)  = 1/(1+exp(-k(w-onset)))    transition logistique d'entrée
      S_off(w) = 1/(1+exp(k(w-offset)))    transition logistique de sortie

    Propriété clé pour le modèle hurdle :
      Les transitions logistiques rendent le classificateur (étage 1)
      non trivial. Les semaines de transition (16-17 et 40-41) ont une
      probabilité P(Y>0) ∈ (0, 1), pas 0 ou 1 brutalement.

    Comportement typique (center=28.5, σ=5.0, onset=16.5, offset=40.5) :
      semaines  1-14 : γ ≈ 0       (zéro strict)
      semaines 15-17 : γ ∈ [0, 0.05] (transition douce d'entrée)
      semaines 18-39 : γ ∈ [0.08, 1] (saison active)
      semaines 40-42 : γ ∈ [0, 0.05] (transition douce de sortie)
      semaines 43-52 : γ ≈ 0       (zéro strict)

    Parameters
    ----------
    week : array-like
        Numéros de semaine calendaire (1 à 52).
    center : float
        Semaine du pic saisonnier (c_z).
    sigma : float
        Écart-type de la gaussienne (σ_z, en semaines).
    onset : float
        Semaine centrale de la transition d'entrée.
    offset : float
        Semaine centrale de la transition de sortie.
    steepness : float
        Pente k des transitions logistiques (défaut : 2.0).

    Returns
    -------
    gamma : ndarray
        Profil saisonnier normalisé ∈ [0, 1], pic ≈ 1.
    """
    w = np.asarray(week, dtype=np.float64)

    # Enveloppe gaussienne (forme de cloche intra-saison)
    bell = np.exp(-0.5 * ((w - center) / sigma) ** 2)

    # Transition d'entrée en saison (sigmoïde croissante)
    s_on = 1.0 / (1.0 + np.exp(-steepness * (w - onset)))

    # Transition de sortie de saison (sigmoïde décroissante)
    s_off = 1.0 / (1.0 + np.exp(steepness * (w - offset)))

    return bell * s_on * s_off


# ═══════════════════════════════════════════════════════════════════════════
# 3.  MÉTÉO SIMULÉE
# ═══════════════════════════════════════════════════════════════════════════

def _generate_weather(
    n_weeks: int,
    rng: np.random.Generator,
    latitude: float
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Génère des séries météorologiques simulées pour une zone.

    [DONNÉE SIMULÉE] — Profils inspirés du climat de Casamance :
      - Saison des pluies : juin–octobre (pic en août, semaine ~32)
      - Pluviométrie annuelle : 1000–1500 mm/an [HYPOTHÈSE]
      - Température : ~30°C sec, ~27°C saison des pluies
      - Humidité : fortement corrélée aux précipitations

    Corrélation temporelle : processus AR(1) sur le bruit hebdomadaire.
    Corrélation spatiale  : ajustement par latitude (gradient N-S).
    Variabilité interannuelle : multiplicateur aléatoire par année.

    Parameters
    ----------
    n_weeks : int
        Nombre total de semaines à générer.
    rng : numpy.random.Generator
        Générateur pseudo-aléatoire.
    latitude : float
        Latitude approximative (°N) — module la quantité de pluie.
        Plus au sud → plus de pluie (gradient pluviométrique Casamance).

    Returns
    -------
    P : ndarray, shape (n_weeks,)
        Précipitations (mm/semaine), ≥ 0.
    T : ndarray, shape (n_weeks,)
        Température moyenne (°C).
    H : ndarray, shape (n_weeks,)
        Humidité relative (%), ∈ [15, 98].
    """
    week_of_year = np.array([((t % 52) + 1) for t in range(n_weeks)])
    n_years = (n_weeks + 51) // 52
    year_idx = np.arange(n_weeks) // 52

    # ── Précipitations P_t ──
    # Profil saisonnier : gaussienne centrée semaine 32 (août), pic ~110 mm/sem
    # [HYPOTHÈSE] — Valeur de pic estimée à partir de données climatiques
    # publiques pour Ziguinchor (≈ 1200 mm/an concentrés sur 18-20 semaines).
    P_seasonal = 110.0 * np.exp(-0.5 * ((week_of_year - 32.0) / 6.5) ** 2)

    # Variabilité interannuelle (±15% par an)
    P_year_mult = 1.0 + rng.normal(0, 0.15, n_years)
    P_year_mult = np.clip(P_year_mult, 0.5, 1.5)
    P_annual = P_year_mult[year_idx]

    # Bruit AR(1) hebdomadaire — ρ = 0.35 (persistance modérée)
    P_noise = np.zeros(n_weeks)
    for t in range(1, n_weeks):
        P_noise[t] = 0.35 * P_noise[t - 1] + rng.normal(0, 14.0)

    # Gradient de latitude : plus au sud (lat élevé ici) → plus de pluie
    # [HYPOTHÈSE] — +10% de pluie par degré de latitude vers le sud
    lat_factor = 1.0 + 0.10 * (latitude - 12.5)

    P = np.maximum(0.0, (P_seasonal * P_annual + P_noise) * lat_factor)

    # ── Température T_t ──
    # Plus chaude en saison sèche (~30.5°C), plus fraîche en pluies (~27°C)
    T_seasonal = 30.5 - 3.5 * np.exp(-0.5 * ((week_of_year - 32.0) / 9.0) ** 2)

    # Bruit AR(1) — ρ = 0.50 (inertie thermique)
    T_noise = np.zeros(n_weeks)
    for t in range(1, n_weeks):
        T_noise[t] = 0.50 * T_noise[t - 1] + rng.normal(0, 0.7)

    # Effet latitude : +0.3°C par degré vers le nord (intérieur plus chaud)
    T = T_seasonal + T_noise + 0.3 * (latitude - 12.5)

    # ── Humidité H_t ──
    # Fortement corrélée à P : H ≈ 35% (sec) → 90% (pleine pluie)
    P_max_approx = 130.0
    H = (35.0
         + 55.0 * np.clip(P / P_max_approx, 0, 1)
         + rng.normal(0, 3.0, n_weeks))
    H = np.clip(H, 15.0, 98.0)

    return P, T, H


# ═══════════════════════════════════════════════════════════════════════════
# 4.  GÉNÉRATEUR PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════

def generate_harvest_data(
    n_zones: int = 5,
    n_seasons: int = 5,
    seed: int = 42
) -> Tuple[pd.DataFrame, Dict]:
    """
    [DONNÉE SIMULÉE] — Génère le jeu de données complet du Module 3.

    Modèle génératif (cf. cahier des charges, Section 8) :

      Y_{z,t} = μ_{z,a} · γ(w_t; z, a) · max(0, 1 + β_P · P̃_{t-ℓ*} + ε_{z,t})

    où :
      μ_{z,a} = μ̄_z · (1 + δ_z · a)            tendance interannuelle
      γ(w_t)  = G(w) · S_on(w) · S_off(w)        profil saisonnier en cloche
      P̃_{t-ℓ*} = (P_{t-ℓ*} - E[P_w]) / σ(P_w)   anomalie normalisée de pluie
      ε_{z,t} ~ N(0, σ²_ε)                       bruit multiplicatif résiduel

    Le lien causal P_{t-ℓ*} → Y_{z,t} est injecté explicitement dans le
    générateur pour que les modèles des Niveaux 1 et 3 (régression avec
    météo, SARIMAX) aient un signal réel à détecter.

    Parameters
    ----------
    n_zones : int
        Nombre de zones géographiques (défaut : 5).
    n_seasons : int
        Nombre de saisons complètes (défaut : 5, soit 260 semaines).
    seed : int
        Graine du générateur pseudo-aléatoire (reproductibilité).

    Returns
    -------
    df : pd.DataFrame
        Long format avec colonnes :
          zone      (str)   nom de la zone
          annee     (int)   année calendaire
          semaine   (int)   numéro de semaine 1–52
          t_global  (int)   index temporel global 1..T
          Y         (float) volume disponible (tonnes) [DONNÉE SIMULÉE]
          P         (float) précipitations (mm/sem)    [DONNÉE SIMULÉE]
          T         (float) température (°C)           [DONNÉE SIMULÉE]
          H         (float) humidité relative (%)      [DONNÉE SIMULÉE]

    metadata : dict
        Paramètres de génération et profils de zones. Constitue la
        « vérité terrain » pour valider les estimations des modèles
        (retards optimaux, sensibilités, etc.).
    """
    rng = np.random.default_rng(seed)
    n_weeks_total = n_seasons * 52

    # ── 1. Profils de zones ──
    zone_params = _generate_zone_params(n_zones, rng)

    all_records = []
    all_onset_jitters: Dict[str, list] = {}
    all_offset_jitters: Dict[str, list] = {}

    for zp in zone_params:

        # ── 2. Météo pour cette zone ──
        P, T_met, H = _generate_weather(n_weeks_total, rng, zp.latitude)

        # ── 3. Statistiques climatologiques de pluie par semaine ──
        #    Servent à normaliser l'anomalie P̃ = (P - E[P_w]) / σ(P_w)
        week_indices = np.array([((t % 52) + 1) for t in range(n_weeks_total)])
        P_mean_by_week = np.zeros(53)   # index 1..52
        P_std_by_week = np.ones(53)     # défaut 1 pour éviter division par 0

        for w in range(1, 53):
            mask = week_indices == w
            vals = P[mask]
            if len(vals) > 1:
                P_mean_by_week[w] = vals.mean()
                P_std_by_week[w] = max(vals.std(), 1.0)
            elif len(vals) == 1:
                P_mean_by_week[w] = vals[0]

        # ── 4. Jitter d'onset/offset par année ──
        #    [HYPOTHÈSE] — La date de début/fin de saison varie d'une
        #    année à l'autre (aléas météo, biologie du manguier), avec un
        #    écart-type de ~0.8 semaine. Cela rend l'étage 1 du modèle
        #    hurdle (classificateur logistique) non trivial à entraîner.
        onset_jitters = rng.normal(0, 0.8, n_seasons)
        offset_jitters = rng.normal(0, 0.8, n_seasons)
        all_onset_jitters[zp.name] = onset_jitters.tolist()
        all_offset_jitters[zp.name] = offset_jitters.tolist()

        # ── 5. Génération semaine par semaine ──
        for year_idx in range(n_seasons):
            year = 2021 + year_idx

            # Onset/offset de cette année (jitter appliqué)
            onset_year = zp.onset_base + onset_jitters[year_idx]
            offset_year = zp.offset_base + offset_jitters[year_idx]

            # Tendance interannuelle : μ_{z,a} = μ̄_z · (1 + δ_z · a)
            trend = zp.base_potential_peak * (1.0 + zp.annual_trend * year_idx)

            for week in range(1, 53):
                t_global = year_idx * 52 + (week - 1)  # index 0-based

                # ─── Profil saisonnier ───
                gamma = float(seasonal_envelope(
                    np.array([week]),
                    zp.season_center, zp.season_sigma,
                    onset_year, offset_year
                )[0])

                # ─── Zéros structurels [HYPOTHÈSE H3] ───
                # Aucune production de mangue en dehors de la fenêtre
                # élargie [15, 42]. Les semaines 15-17 et 40-42 sont
                # la zone de transition (volumes possiblement nuls).
                if week <= 14 or week >= 43:
                    Y = 0.0
                elif gamma < 1e-4:
                    Y = 0.0
                else:
                    # ─── Effet météo retardé ───
                    # Lien causal injecté : P_{t-ℓ*} → Y_{z,t}
                    t_lag = t_global - zp.optimal_lag
                    weather_effect = 0.0
                    if t_lag >= 0:
                        w_lag = week_indices[t_lag]
                        P_anomaly = (
                            (P[t_lag] - P_mean_by_week[w_lag])
                            / P_std_by_week[w_lag]
                        )
                        weather_effect = zp.rain_sensitivity * P_anomaly

                    # ─── Bruit multiplicatif résiduel ───
                    # ε ~ N(0, σ²_ε), appliqué en multiplicatif
                    noise = rng.normal(0, zp.noise_cv)

                    # ─── Volume final ───
                    Y = trend * gamma * max(0.0, 1.0 + weather_effect + noise)

                    # Seuil de détection : < 50 kg → opérationnellement nul
                    # (pas de collecte pour des quantités infimes)
                    if Y < 0.05:
                        Y = 0.0

                all_records.append({
                    'zone': zp.name,
                    'annee': year,
                    'semaine': week,
                    't_global': t_global + 1,   # 1-indexed pour l'utilisateur
                    'Y': round(Y, 3),
                    'P': round(P[t_global], 2),
                    'T': round(T_met[t_global], 2),
                    'H': round(H[t_global], 1),
                })

    df = pd.DataFrame(all_records)

    # ── 6. Métadonnées (vérité terrain pour validation des modèles) ──
    metadata = {
        'generator': 'SM10 Module 3 — data_generator.py v1.0.0',
        'status': '[DONNÉE SIMULÉE]',
        'n_zones': n_zones,
        'n_seasons': n_seasons,
        'n_weeks_total': n_weeks_total,
        'seed': seed,
        'start_year': 2021,
        'season_window_S': list(range(18, 40)),
        'zones': {zp.name: asdict(zp) for zp in zone_params},
        'onset_jitters': all_onset_jitters,
        'offset_jitters': all_offset_jitters,
        'hypotheses': {
            'H1': 'Y_disp ≈ Y_eff (SM10 collecte quasi-totalité du disponible)',
            'H2': 'Saisonnalité annuelle s=52 semaines',
            'H3': 'Zéros structurels : Y=0 pour semaines ≤14 et ≥43',
            'H4': 'Indépendance conditionnelle inter-zones | météo',
            'H5': 'Désagrégation zone→producteur ∝ A_i·R_i·TR_i',
        },
        'noise_model': 'Multiplicatif — Y = μ·γ·max(0, 1 + β_P·P̃_{t-ℓ*} + ε)',
        'noise_justification': (
            'Bruit multiplicatif : la variance du volume croît avec le '
            'niveau moyen (hétéroscédasticité naturelle en agriculture). '
            'Garantit en outre la non-négativité via max(0, ·).'
        ),
    }

    return df, metadata


# ═══════════════════════════════════════════════════════════════════════════
# 5.  VALIDATION DES DONNÉES GÉNÉRÉES
# ═══════════════════════════════════════════════════════════════════════════

def validate_generated_data(df: pd.DataFrame, metadata: Dict) -> None:
    """
    Vérifie la cohérence structurelle du jeu de données généré.

    Lève une AssertionError en cas de problème.

    Vérifications :
      1. Nombre de lignes correct (n_zones × n_seasons × 52)
      2. Volumes Y ≥ 0
      3. Zéros stricts hors saison étendue (semaines ≤ 14 et ≥ 43)
      4. Au moins 50% des semaines en [20, 37] ont Y > 0 (saison active)
      5. Précipitations P ≥ 0
      6. Température dans une plage réaliste
      7. Humidité dans [15, 98]
      8. Pas de valeurs NaN
    """
    n_expected = metadata['n_zones'] * metadata['n_seasons'] * 52

    assert len(df) == n_expected, (
        f"Nombre de lignes incorrect : {len(df)} != {n_expected}")

    assert (df['Y'] >= 0).all(), "Volumes négatifs détectés"

    # Zéros stricts hors saison étendue
    hors_saison = df[(df['semaine'] <= 14) | (df['semaine'] >= 43)]
    assert (hors_saison['Y'] == 0).all(), (
        "Volumes non nuls détectés hors saison étendue (sem ≤ 14 ou ≥ 43)")

    # Saison active : au moins 50% de Y > 0 dans le cœur [20, 37]
    coeur = df[(df['semaine'] >= 20) & (df['semaine'] <= 37)]
    taux_actif = (coeur['Y'] > 0).mean()
    assert taux_actif > 0.50, (
        f"Trop peu de semaines actives dans le cœur de saison : {taux_actif:.1%}")

    assert (df['P'] >= 0).all(), "Précipitations négatives détectées"
    assert df['T'].between(15, 45).all(), "Températures hors plage [15, 45] °C"
    assert df['H'].between(10, 100).all(), "Humidité hors plage [10, 100] %"
    assert not df.isnull().any().any(), "Valeurs NaN détectées"


# ═══════════════════════════════════════════════════════════════════════════
# 6.  RÉSUMÉ DIAGNOSTIQUE
# ═══════════════════════════════════════════════════════════════════════════

def print_generation_summary(df: pd.DataFrame, metadata: Dict) -> None:
    """Affiche un résumé diagnostique du jeu de données généré."""
    print()
    print("\n" + "=" * 70)
    print("  SM10 MODULE 3 -- RESUME DU JEU DE DONNEES GENERE")
    print(f"  Statut : {metadata['status']}")
    print(f"  Graine : {metadata['seed']}")
    print("=" * 70)

    for zone_name in df['zone'].unique():
        dz = df[df['zone'] == zone_name]
        dz_pos = dz[dz['Y'] > 0]
        zinfo = metadata['zones'][zone_name]

        print(f"\n  +-- Zone : {zone_name}")
        print(f"  |  Potentiel pic      : {zinfo['base_potential_peak']:6.1f} t/sem")
        print(f"  |  Tendance           : {zinfo['annual_trend']:+.3f} /an")
        print(f"  |  Lag optimal        : {zinfo['optimal_lag']} semaines")
        print(f"  |  Sensibilite pluie  : {zinfo['rain_sensitivity']:.3f}")
        print(f"  |  Bruit CV           : {zinfo['noise_cv']:.3f}")
        print(f"  |  Observations Y > 0 : {len(dz_pos):>4d} / {len(dz)}")

        if len(dz_pos) > 0:
            print(f"  |  Volume (Y > 0)     : "
                  f"min={dz_pos['Y'].min():6.2f}  "
                  f"moy={dz_pos['Y'].mean():6.2f}  "
                  f"max={dz_pos['Y'].max():6.2f} t/sem")

        # Production totale par saison
        saison_totals = []
        for year in sorted(dz['annee'].unique()):
            total = dz[dz['annee'] == year]['Y'].sum()
            saison_totals.append(total)
        print(f"  |  Production/saison  : "
              f"[{', '.join(f'{v:.0f}' for v in saison_totals)}] tonnes")
        print(f"  +--")

    # Statistiques globales
    total_all = df['Y'].sum()
    n_obs_pos = (df['Y'] > 0).sum()
    n_obs_zero = (df['Y'] == 0).sum()

    print(f"\n  -- GLOBAL --")
    print(f"  Total toutes zones/saisons : {total_all:,.0f} tonnes")
    print(f"  Observations Y > 0         : {n_obs_pos} ({n_obs_pos/len(df):.1%})")
    print(f"  Observations Y = 0         : {n_obs_zero} ({n_obs_zero/len(df):.1%})")
    print(f"  Dimensions DataFrame       : {df.shape[0]} lignes x {df.shape[1]} colonnes")
    print("=" * 70)


# ═══════════════════════════════════════════════════════════════════════════
# 7.  POINT D'ENTRÉE AUTONOME
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    import os
    from config import DATA_RAW_DIR

    print("SM10 Module 3 — Génération autonome du jeu de données simulé")
    print("-" * 70)

    df, metadata = generate_harvest_data(n_zones=5, n_seasons=5, seed=42)

    # Validation
    validate_generated_data(df, metadata)
    print("[OK] Toutes les validations structurelles passées.")

    # Résumé
    print_generation_summary(df, metadata)

    # Export
    output_path = os.path.join(DATA_RAW_DIR, 'simulated_harvest_data.csv')
    df.to_csv(output_path, index=False)
    print(f"\n[OK] Données exportées : {output_path}")
