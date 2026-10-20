import pandas as pd
import numpy as np

# Load the generated data
df = pd.read_csv('data/raw/simulated_harvest_data.csv')

print("="*70)
print("VERIFICATION DU SIGNAL CAUSAL (CORRELATION CROISEE DES ANOMALIES)")
print("="*70)

# Calculate anomalies by subtracting weekly means
df['Y_mean'] = df.groupby(['zone', 'semaine'])['Y'].transform('mean')
df['Y_anom'] = df['Y'] - df['Y_mean']

df['P_mean'] = df.groupby(['zone', 'semaine'])['P'].transform('mean')
df['P_anom'] = df['P'] - df['P_mean']

lags = range(13) # 0 to 12

for zone in df['zone'].unique():
    dz = df[df['zone'] == zone].sort_values('t_global')
    
    correlations = []
    
    Y = dz['Y_anom'].values
    P = dz['P_anom'].values
    
    for lag in lags:
        if lag == 0:
            corr = np.corrcoef(Y, P)[0, 1]
        else:
            P_shifted = P[:-lag]
            Y_aligned = Y[lag:]
            corr = np.corrcoef(Y_aligned, P_shifted)[0, 1]
            
        correlations.append((lag, corr))
        
    best_lag, best_corr = max(correlations, key=lambda item: item[1])
    
    print(f"Zone: {zone:<15} | Max Correlation (Anomalies): {best_corr:+.3f} at Lag: {best_lag} semaines")
    
print("="*70)
