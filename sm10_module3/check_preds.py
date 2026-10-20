import os
import pandas as pd
import numpy as np
from src.hurdle_pipeline_eval import run_hurdle_pipeline_evaluation
from src.evaluation import calculate_metrics

base_dir = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(base_dir, 'data/raw/simulated_harvest_data.csv')
df = pd.read_csv(data_path)

df_preds, df_global, df_cond, df_strata = run_hurdle_pipeline_evaluation(df)

print("Unique years in test folds:", sorted(df_preds['fold'].unique()))
print("Unique zones:", sorted(df_preds['zone'].unique()))
print("Total out-of-sample predictions:", len(df_preds))
