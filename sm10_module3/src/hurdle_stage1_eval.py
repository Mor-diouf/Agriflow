"""
=============================================================================
SM10 Agro — Module 3 : Prévision des volumes de récolte
Fichier : hurdle_stage1_eval.py

Validation de l'Étage 1 du modèle Hurdle (Classificateur des zéros).
Méthode : Régression Logistique avec Splines Cubiques Naturelles sur w_t.
Évaluation : Walk-Forward sur 5 saisons, focus sur la "Zone Grise".
=============================================================================
"""

import os
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score
from patsy import dmatrix

# Définition de la Zone Grise (Semaines de transition)
ZONE_GRISE_ENTREE = list(range(15, 20))  # [15, 16, 17, 18, 19]
ZONE_GRISE_SORTIE = list(range(40, 43))  # [40, 41, 42]
ZONE_GRISE = ZONE_GRISE_ENTREE + ZONE_GRISE_SORTIE

def prepare_features(df: pd.DataFrame, is_train: bool = True) -> pd.DataFrame:
    """Prépare la matrice de features avec les Splines Cubiques."""
    # Les nœuds de la spline sont placés aux points de transition clés
    # On utilise bs() avec degree=3 pour des splines cubiques.
    # Pour garantir la compatibilité, on utilise un One-Hot Encoding ou Splines
    # Ici, nous utilisons les splines via patsy.
    
    # Afin d'éviter les erreurs patsy sur des dataframes vides ou si on prédit
    formula = "bs(semaine, knots=[15, 19, 40, 42], degree=3, include_intercept=False)"
    
    df_splines = dmatrix(formula, {"semaine": df['semaine'].values}, return_type='dataframe')
    
    # Ajout des features au dataframe
    df_features = pd.concat([df.reset_index(drop=True), df_splines.reset_index(drop=True)], axis=1)
    
    # La cible binaire : 1 si volume > 0, 0 sinon
    df_features['y_binary'] = (df_features['Y'] > 0).astype(int)
    
    return df_features

def evaluate_threshold(y_true, y_prob, threshold: float = 0.5) -> dict:
    """Calcule les métriques de classification pour un seuil donné."""
    y_pred = (y_prob >= threshold).astype(int)
    if len(np.unique(y_true)) > 1:
        auc = roc_auc_score(y_true, y_prob)
    else:
        auc = np.nan
        
    return {
        'Precision': precision_score(y_true, y_pred, zero_division=0),
        'Recall': recall_score(y_true, y_pred, zero_division=0),
        'F1': f1_score(y_true, y_pred, zero_division=0),
        'AUC': auc
    }

def find_youden_index(y_true, y_prob) -> float:
    """Trouve le seuil optimal maximisant l'index de Youden (Sensibilité + Spécificité - 1)."""
    from sklearn.metrics import roc_curve
    if len(np.unique(y_true)) > 1:
        fpr, tpr, thresholds = roc_curve(y_true, y_prob)
        j_scores = tpr - fpr
        best_idx = np.argmax(j_scores)
        return thresholds[best_idx]
    return 0.5

def run_hurdle_stage1_validation(df: pd.DataFrame):
    """Exécute la validation croisée walk-forward pour l'Étage 1."""
    years = sorted(df['annee'].unique())
    if len(years) < 2:
        raise ValueError("Historique insuffisant pour walk-forward (min 2 saisons requises).")
        
    results = []
    
    for test_idx in range(1, len(years)):
        train_years = years[:test_idx]
        test_year = years[test_idx]
        
        df_train_raw = df[df['annee'].isin(train_years)]
        df_test_raw = df[df['annee'] == test_year]
        
        # Préparation des features splines
        df_train = prepare_features(df_train_raw)
        df_test = prepare_features(df_test_raw)
        
        # Colonnes générées par Patsy pour les splines
        feature_cols = [c for c in df_train.columns if c.startswith('bs(')]
        
        for zone in df['zone'].unique():
            dz_train = df_train[df_train['zone'] == zone]
            dz_test = df_test[df_test['zone'] == zone]
            
            X_train = dz_train[feature_cols].values
            y_train = dz_train['y_binary'].values
            
            X_test = dz_test[feature_cols].values
            y_test = dz_test['y_binary'].values
            
            # Entraînement Logistic Regression
            clf = LogisticRegression(max_iter=1000, class_weight='balanced')
            clf.fit(X_train, y_train)
            
            # Prédiction probabilités
            y_prob = clf.predict_proba(X_test)[:, 1]
            dz_test = dz_test.copy()
            dz_test['prob_active'] = y_prob
            
            # Calcul du seuil optimal de Youden sur l'entraînement
            y_prob_train = clf.predict_proba(X_train)[:, 1]
            optimal_thresh = find_youden_index(y_train, y_prob_train)
            
            # --- EVALUATION ---
            
            # 1. Globalement
            metrics_global = evaluate_threshold(y_test, y_prob, threshold=optimal_thresh)
            
            # 2. Zone Grise - Entrée (15-19)
            mask_entree = dz_test['semaine'].isin(ZONE_GRISE_ENTREE)
            if mask_entree.any():
                metrics_entree = evaluate_threshold(y_test[mask_entree], y_prob[mask_entree], threshold=optimal_thresh)
            else:
                metrics_entree = {'Precision': np.nan, 'Recall': np.nan, 'F1': np.nan, 'AUC': np.nan}
                
            # 3. Zone Grise - Sortie (40-42)
            mask_sortie = dz_test['semaine'].isin(ZONE_GRISE_SORTIE)
            if mask_sortie.any():
                metrics_sortie = evaluate_threshold(y_test[mask_sortie], y_prob[mask_sortie], threshold=optimal_thresh)
            else:
                metrics_sortie = {'Precision': np.nan, 'Recall': np.nan, 'F1': np.nan, 'AUC': np.nan}
                
            # 4. Zone Grise - Agrégée
            mask_grise = dz_test['semaine'].isin(ZONE_GRISE)
            if mask_grise.any():
                metrics_grise = evaluate_threshold(y_test[mask_grise], y_prob[mask_grise], threshold=optimal_thresh)
            else:
                metrics_grise = {'Precision': np.nan, 'Recall': np.nan, 'F1': np.nan, 'AUC': np.nan}
            
            results.append({
                'Fold': test_year,
                'Zone': zone,
                'Seuil_Opt': optimal_thresh,
                
                'Glob_AUC': metrics_global['AUC'],
                'Glob_Prec': metrics_global['Precision'],
                'Glob_Rec': metrics_global['Recall'],
                'Glob_F1': metrics_global['F1'],
                
                'Entree_AUC': metrics_entree['AUC'],
                'Entree_Prec': metrics_entree['Precision'],
                'Entree_Rec': metrics_entree['Recall'],
                'Entree_F1': metrics_entree['F1'],
                
                'Sortie_AUC': metrics_sortie['AUC'],
                'Sortie_Prec': metrics_sortie['Precision'],
                'Sortie_Rec': metrics_sortie['Recall'],
                'Sortie_F1': metrics_sortie['F1'],
                
                'Grise_AUC': metrics_grise['AUC'],
                'Grise_Prec': metrics_grise['Precision'],
                'Grise_Rec': metrics_grise['Recall'],
                'Grise_F1': metrics_grise['F1'],
            })

    return pd.DataFrame(results)

if __name__ == '__main__':
    print("=" * 70)
    print("  SM10 Agro — Étage 1 Hurdle : Validation Walk-Forward")
    print("=" * 70)
    
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    df = pd.read_csv(os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv'))
    
    res_df = run_hurdle_stage1_validation(df)
    
    # Agrégation des résultats (Moyenne sur 4 folds de test)
    agg = res_df.mean(numeric_only=True).round(3)
    
    print("\n[PERFORMANCES MOYENNES (4 folds de test)]")
    print(f"Seuil de Youden optimal moyen : {agg['Seuil_Opt']:.2f}")
    
    print("\n1. GLOBAL (Toute l'année)")
    print(f"   AUC = {agg['Glob_AUC']:.3f} | F1 = {agg['Glob_F1']:.3f} | "
          f"Précision = {agg['Glob_Prec']:.3f} | Rappel = {agg['Glob_Rec']:.3f}")
          
    print("\n2. ZONE GRISE - ENTRÉE EN SAISON (Semaines 15-19)")
    print(f"   AUC = {agg['Entree_AUC']:.3f} | F1 = {agg['Entree_F1']:.3f} | "
          f"Précision = {agg['Entree_Prec']:.3f} | Rappel = {agg['Entree_Rec']:.3f}")
    
    print("\n3. ZONE GRISE - SORTIE DE SAISON (Semaines 40-42)")
    print(f"   AUC = {agg['Sortie_AUC']:.3f} | F1 = {agg['Sortie_F1']:.3f} | "
          f"Précision = {agg['Sortie_Prec']:.3f} | Rappel = {agg['Sortie_Rec']:.3f}")
    
    print("\n4. ZONE GRISE - AGRÉGÉE (15-19 & 40-42)")
    print(f"   AUC = {agg['Grise_AUC']:.3f} | F1 = {agg['Grise_F1']:.3f} | "
          f"Précision = {agg['Grise_Prec']:.3f} | Rappel = {agg['Grise_Rec']:.3f}")
    
    print("\n" + "=" * 70)
    print("  Évaluation Étage 1 Terminée.")
    print("=" * 70)
