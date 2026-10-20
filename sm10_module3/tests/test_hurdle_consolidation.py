"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : test_hurdle_consolidation.py

Tests de cohérence méthodologique et d'intégrité pour la Phase F (via unittest standard) :
1. Absence de fuite temporelle
2. Facteur de Duan calculé strictement sur les données d'entraînement
3. Aucune valeur négative prédite
4. Cohérence des dimensions
5. Reproductibilité avec graine fixée
6. Cohérence mathématique entre prédiction naïve et prédiction corrigée par Duan
7. Présence et validité de toutes les métriques requises (MAE, RMSE, Biais, MAPE)
=============================================================================
"""

import os
import unittest
import numpy as np
import pandas as pd
from src.features import engineer_features
from src.regression_models import HurdleStage2Ridge, HurdleStage2RF
from src.evaluation import calculate_metrics

class TestHurdleConsolidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
        df = pd.read_csv(data_path)
        cls.dataset = engineer_features(df)

    def test_01_temporal_leakage_and_splits(self):
        """Vérifie l'étanchéité temporelle stricte : aucun enregistrement test dans le train."""
        years = sorted(self.dataset['annee'].unique())
        for test_idx in range(1, len(years)):
            train_years = years[:test_idx]
            test_year = years[test_idx]
            
            df_train = self.dataset[self.dataset['annee'].isin(train_years)]
            df_test = self.dataset[self.dataset['annee'] == test_year]
            
            self.assertLess(
                df_train['t_global'].max(), 
                df_test['t_global'].min(),
                f"Fuite temporelle détectée pour le fold test {test_year}!"
            )
            self.assertNotIn(test_year, df_train['annee'].values)

    def test_02_duan_factor_strictly_on_train(self):
        """
        Vérifie que le facteur de Duan est calculé uniquement sur les résidus d'entraînement
        et reste invariant quel que soit le jeu de test présenté.
        """
        zone = 'Bignona'
        df_train = self.dataset[self.dataset['annee'].isin([2020, 2021])].copy()
        df_test_1 = self.dataset[self.dataset['annee'] == 2022].copy()
        df_test_2 = df_test_1.copy()
        # Altération artificielle du test pour garantir l'indépendance
        df_test_2['P'] = df_test_2['P'] * 10.0
        
        model = HurdleStage2Ridge(alpha=1.0, use_duan=True)
        model.fit(df_train, zone)
        
        # 1. Vérification de la formule de Duan sur les résidus d'entraînement
        residuals_train = model.train_residuals_by_zone[zone]
        expected_duan = float(np.mean(np.exp(residuals_train)))
        actual_duan = model.duan_factors_by_zone[zone]
        
        self.assertAlmostEqual(actual_duan, expected_duan, places=5)
        
        # 2. Le facteur ne doit pas changer lors d'appels répétés sur différents tests
        _ = model.predict(df_test_1, zone)
        factor_after_test1 = model.duan_factors_by_zone[zone]
        _ = model.predict(df_test_2, zone)
        factor_after_test2 = model.duan_factors_by_zone[zone]
        
        self.assertEqual(factor_after_test1, actual_duan)
        self.assertEqual(factor_after_test2, actual_duan)

    def test_03_no_negative_predictions(self):
        """Vérifie que les prédictions sont toujours >= 0, pour Ridge et RF."""
        zone = 'Ziguinchor'
        df_train = self.dataset[self.dataset['annee'] == 2020]
        df_test = self.dataset[self.dataset['annee'] == 2021]
        
        ridge = HurdleStage2Ridge(alpha=1.0)
        ridge.fit(df_train, zone)
        preds_ridge_naive = ridge.predict_naive(df_test, zone)
        preds_ridge_duan = ridge.predict_duan(df_test, zone)
        
        rf = HurdleStage2RF(random_state=42)
        rf.fit(df_train, zone)
        preds_rf = rf.predict(df_test, zone)
        
        self.assertTrue(np.all(preds_ridge_naive >= 0.0), "Valeurs négatives détectées (Ridge naïf)")
        self.assertTrue(np.all(preds_ridge_duan >= 0.0), "Valeurs négatives détectées (Ridge Duan)")
        self.assertTrue(np.all(preds_rf >= 0.0), "Valeurs négatives détectées (RF)")

    def test_04_dimensional_consistency(self):
        """Vérifie que la forme de sortie correspond exactement aux lignes du test."""
        zone = 'Oussouye'
        df_train = self.dataset[self.dataset['annee'] == 2020]
        df_test = self.dataset[self.dataset['annee'] == 2021]
        n_expected = len(df_test[df_test['zone'] == zone])
        
        model = HurdleStage2Ridge(alpha=1.0)
        model.fit(df_train, zone)
        preds = model.predict(df_test, zone)
        
        self.assertIsInstance(preds, np.ndarray)
        self.assertEqual(preds.shape, (n_expected,))
        self.assertFalse(np.isnan(preds).any(), "Présence de NaN dans les prédictions")

    def test_05_reproducibility_with_fixed_seed(self):
        """Vérifie la stricte reproductibilité des résultats entre deux exécutions."""
        zone = 'Sédhiou'
        df_train = self.dataset[self.dataset['annee'].isin([2020, 2021])]
        df_test = self.dataset[self.dataset['annee'] == 2022]
        
        rf1 = HurdleStage2RF(random_state=42)
        rf1.fit(df_train, zone)
        preds1 = rf1.predict(df_test, zone)
        
        rf2 = HurdleStage2RF(random_state=42)
        rf2.fit(df_train, zone)
        preds2 = rf2.predict(df_test, zone)
        
        self.assertTrue(np.allclose(preds1, preds2, atol=1e-8), "Résultats non reproductibles pour RF")

    def test_06_duan_vs_naive_coherence(self):
        """
        Vérifie la relation mathématique fondamentale :
        Y_pred_Duan = Y_pred_naif * S_Duan
        et l'inégalité de Jensen : S_Duan >= 1.0 pour des résidus centrés.
        """
        zone = 'Kolda'
        df_train = self.dataset[self.dataset['annee'].isin([2020, 2021, 2022])]
        df_test = self.dataset[self.dataset['annee'] == 2023]
        
        model = HurdleStage2Ridge(alpha=1.0)
        model.fit(df_train, zone)
        
        factor = model.duan_factors_by_zone[zone]
        self.assertGreaterEqual(factor, 1.0 - 1e-4, f"Le facteur de Duan {factor} est < 1 !")
        
        preds_naive = model.predict_naive(df_test, zone)
        preds_duan = model.predict_duan(df_test, zone)
        
        expected_duan = preds_naive * factor
        self.assertTrue(np.allclose(preds_duan, expected_duan, atol=1e-6))
        self.assertTrue(np.all(preds_duan >= preds_naive - 1e-6))

    def test_07_presence_of_all_required_metrics(self):
        """Vérifie la présence et le calcul correct de MAE, RMSE, Biais et MAPE."""
        y_true = np.array([10.0, 20.0, 30.0, 40.0])
        # Sous-estimation systématique de 2 unités
        y_pred = np.array([8.0, 18.0, 28.0, 38.0])
        
        metrics = calculate_metrics(y_true, y_pred)
        
        required_keys = {'MAE', 'RMSE', 'Bias', 'MAPE', 'MdAPE'}
        self.assertTrue(required_keys.issubset(metrics.keys()))
        
        self.assertAlmostEqual(metrics['MAE'], 2.0)
        self.assertAlmostEqual(metrics['RMSE'], 2.0)
        self.assertAlmostEqual(metrics['Bias'], -2.0)
        self.assertAlmostEqual(metrics['MAPE'], np.mean([20.0, 10.0, 20.0/3, 5.0]))

if __name__ == '__main__':
    unittest.main()
