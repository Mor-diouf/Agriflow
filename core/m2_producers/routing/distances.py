import numpy as np

def generate_distance_matrix(n_producers: int, seed: int = 42):
    """
    Génère des coordonnées 2D pour construire une matrice de distances
    symétrique et respectant l'inégalité triangulaire (Euclidienne).
    Index 0 = Usine, Index 1..N = Producteurs.
    """
    np.random.seed(seed)
    
    # Coordonnées (usine + producteurs) dans un carré de 100x100 km
    coords = np.random.rand(n_producers + 1, 2) * 100 
    
    dist_matrix = np.zeros((n_producers + 1, n_producers + 1))
    
    for i in range(n_producers + 1):
        for j in range(n_producers + 1):
            dist_matrix[i, j] = np.linalg.norm(coords[i] - coords[j])
            
    return dist_matrix

def extract_daily_distances(dist_matrix, active_indices):
    """
    Extrait la sous-matrice des distances pour l'usine (0) et les producteurs actifs.
    active_indices sont les indices dans le DataFrame original.
    """
    # L'usine a l'index 0, les producteurs originaux ont les indices 1..N.
    # active_indices correspond aux producteurs (0-indexés dans df), 
    # donc on les décale de +1 pour les indices de la matrice.
    subset = [0] + [i + 1 for i in active_indices]
    
    n_active = len(active_indices)
    D_t = np.zeros((n_active + 1, n_active + 1))
    
    for new_i, old_i in enumerate(subset):
        for new_j, old_j in enumerate(subset):
            D_t[new_i, new_j] = dist_matrix[old_i, old_j]
            
    return D_t
