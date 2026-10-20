import os

# Origines autorisées à appeler l'API depuis un navigateur (séparées par des virgules).
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "SM10_CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if o.strip()
]
