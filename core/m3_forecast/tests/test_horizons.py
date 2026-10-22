"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : test_horizons.py

Tests de la Phase J (prévision à plusieurs semaines), via unittest standard :
1. Variables exogènes : rien de postérieur à l'origine t − h
2. SARIMAX dynamique : la prévision de t ignore les observations après t − h
3. Recalibrage conforme : écart nul si déjà calibré, premier pli inchangé, niveaux ordonnés,
   jamais de resserrement
4. Combinaison SARIMAX + climatologie : poids appris sur les plis passés seulement
Lancement (depuis core/m3_forecast) : python -m unittest tests.test_horizons
=============================================================================
"""

import unittest

import numpy as np
import pandas as pd

from src.horizon_eval import combine_central, conformal_shift, horizon_exog, recalibrate, sarimax_h_step


def seasonal_zone(n_years: int = 3, seed: int = 0) -> pd.DataFrame:
    """Série hebdomadaire synthétique d'une zone : récolte en cloche, pluie et température bruitées."""
    rng = np.random.default_rng(seed)
    weeks = np.tile(np.arange(1, 53), n_years)
    harvest = np.where((weeks >= 18) & (weeks <= 39), 40 * np.sin(np.pi * (weeks - 17) / 23), 0.0)
    return pd.DataFrame({
        'semaine': weeks,
        't_global': np.arange(1, 52 * n_years + 1),
        'Y': np.maximum(0.0, harvest + rng.normal(0, 2, len(weeks))),
        'P': rng.gamma(2.0, 10.0, len(weeks)),
        'T': 30 + rng.normal(0, 1, len(weeks)),
    })


class TestHorizonForecasts(unittest.TestCase):
    def test_01_exog_known_at_origin(self):
        """Les variables de la semaine t ne changent pas si l'on modifie tout ce qui suit t − h."""
        dz = seasonal_zone()
        for zone, h in (('Ziguinchor', 1), ('Ziguinchor', 4), ('Kolda', 8)):
            t = 120
            perturbed = dz.copy()
            perturbed.loc[t - h + 1:, ['P', 'T', 'Y']] *= 3.0
            pd.testing.assert_series_equal(
                horizon_exog(dz, zone, h).loc[t], horizon_exog(perturbed, zone, h).loc[t], check_names=False,
            )

    def test_02_sarimax_dynamic_ignores_future(self):
        """La prévision à h pas de la cible t n'utilise aucune observation après l'origine t − h."""
        dz = seasonal_zone()
        n_train, h, target = 104, 3, 20
        exog = horizon_exog(dz, 'Kolda', h).values
        y = dz['Y'].values.astype(float)
        preds, _ = sarimax_h_step(y, exog, n_train, h)

        y_future_changed = y.copy()
        y_future_changed[n_train + target - h + 1:] += 50.0
        preds_changed, _ = sarimax_h_step(y_future_changed, exog, n_train, h)
        self.assertAlmostEqual(preds[target], preds_changed[target], places=6)
        self.assertTrue(np.all(preds >= 0.0))

    def test_03_conformal_shift(self):
        """Un quantile qui couvre déjà parfaitement n'est pas décalé ; un quantile trop bas l'est."""
        q_pred = np.full(99, 10.0)
        self.assertEqual(conformal_shift(q_pred.copy(), q_pred, 0.9), 0.0)
        y = q_pred * 1.2
        self.assertAlmostEqual(conformal_shift(y, q_pred, 0.9), 0.2)
        self.assertEqual(conformal_shift(np.array([]), np.array([]), 0.9), 0.0)

    def test_04_recalibrate_uses_only_past_folds(self):
        """Premier pli brut ; les suivants recalibrés sur les plis passés ; prudent ≤ stress."""
        rows = []
        for fold in (2022, 2023):
            for i in range(30):
                rows.append({
                    'fold': fold, 'horizon': 1, 'y_true': 12.0, 'is_active': True, 'mask_pred': 1,
                    'pred_q75_raw': 10.0, 'pred_q90_raw': 11.0,
                })
        df = recalibrate(pd.DataFrame(rows))
        first, second = df[df['fold'] == 2022], df[df['fold'] == 2023]
        self.assertTrue((first['pred_q90'] == 11.0).all())
        # En 2022, la récolte (12 t) dépassait le stress brut (11 t) : 2023 est relevé pour la couvrir
        self.assertTrue((second['pred_q90'] >= 12.0 - 1e-9).all())
        self.assertTrue((df['pred_q75'] <= df['pred_q90']).all())

    def test_05_recalibrate_never_tightens(self):
        """Une saison passée sur-couverte ne resserre pas la suivante : un niveau de sécurité ne baisse pas."""
        rows = [
            {'fold': fold, 'horizon': 1, 'y_true': 5.0, 'is_active': True, 'mask_pred': 1,
             'pred_q75_raw': 10.0, 'pred_q90_raw': 11.0}
            for fold in (2022, 2023) for _ in range(30)
        ]
        df = recalibrate(pd.DataFrame(rows))
        self.assertTrue((df['pred_q90'] == 11.0).all())
        self.assertTrue((df['pred_q75'] == 10.0).all())

    def test_06_blend_weight_learned_on_past_folds(self):
        """Premier pli à 0,5 ; ensuite, le poids qui aurait été le meilleur sur les plis passés."""
        rows = []
        for fold in (2022, 2023):
            for i in range(20):
                # En 2022, la climatologie tombe juste et SARIMAX se trompe : 2023 doit suivre la climatologie
                rows.append({'fold': fold, 'horizon': 3, 'y_true': 10.0, 'is_active': True,
                             'pred_sarimax': 16.0 if fold == 2022 else 99.0, 'pred_clim': 10.0})
        df = combine_central(pd.DataFrame(rows))
        first, second = df[df['fold'] == 2022], df[df['fold'] == 2023]
        self.assertTrue((first['w_sarimax'] == 0.5).all())
        self.assertTrue(np.allclose(first['pred_central'], 13.0))
        # Le poids de 2023 ne dépend pas des valeurs de 2023 (99 t), seulement de 2022
        self.assertTrue((second['w_sarimax'] == 0.0).all())
        self.assertTrue(np.allclose(second['pred_central'], 10.0))


if __name__ == '__main__':
    unittest.main()
