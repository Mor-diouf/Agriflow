"""
=============================================================================
SM10 Agro — Module 5 : Serveur d'Inférence Vocal Wolof "Hawa"
Fichier : hawa_inference_server.py

Fournit une API REST haute performance pour la synthèse vocale intégrale en Wolof.
Fonctionnalités :
1. Découpage intelligent (Smart Chunking) pour les longs textes et paragraphes
2. Synthèse neuronale séquentielle (SpeechT5 Wolof + HiFi-GAN)
3. Concaténation audio fluide (Audio Stitching avec micro-pauses)
4. Cache audio local ultra-rapide (SHA-256)
5. Compatible 100% CPU local (< 600 Mo de RAM)
=============================================================================
"""

import os
import io
import re
import sys
import hashlib
import zipfile
import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Dossier du cache audio
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# Initialisation FastAPI
app = FastAPI(
    title="Hawa Wolof TTS Inference Server",
    description="Serveur de synthèse vocale neuronale en Wolof pour SM10 Agro Copilot",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy loaded model variables
device = "cpu"
processor = None
model = None
vocoder = None
speaker_embeddings = None

def load_tts_model():
    global processor, model, vocoder, speaker_embeddings, device
    if model is not None:
        return

    print("=" * 65)
    print("  CHARGEMENT DU MOTEUR NEURONAL HAWA WOLOF (SPEECHT5)...")
    print("=" * 65)

    import torch
    from huggingface_hub import hf_hub_download
    from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan

    model_id = "bilalfaye/speecht5_tts-wolof"
    processor = SpeechT5Processor.from_pretrained(model_id)
    model = SpeechT5ForTextToSpeech.from_pretrained(model_id).to(device)
    vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(device)

    # Chargement du profil vocal x-vector féminin "Hawa"
    zip_path = hf_hub_download(
        repo_id="Matthijs/cmu-arctic-xvectors",
        filename="spkrec-xvect.zip",
        repo_type="dataset"
    )
    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open("spkrec-xvect/cmu_us_clb_arctic-wav-arctic_b0378.npy") as f:
            speaker_embeddings = torch.tensor(
                np.load(io.BytesIO(f.read())), 
                dtype=torch.float32
            ).unsqueeze(0).to(device)

    print(">> Modèle chargé avec succès ! Prêt pour l'inférence.")
    print("=" * 65)

def clean_markdown_text(text: str) -> str:
    """Nettoie le formatage markdown, URLs et métadonnées pour la lecture audio."""
    # Retirer les liens markdown [texte](url) -> texte
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Retirer le gras, italique, code
    text = re.sub(r'[*_`#~]', ' ', text)
    # Retirer les listes à puces
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    # Retirer les séparateurs et entêtes de tableau
    text = re.sub(r'\|[ -:|]+\|', ' ', text)
    text = text.replace('|', ', ')
    # Remplacer les retours à la ligne multiples par un point s'il n'y a pas déjà de ponctuation
    text = re.sub(r'([.?!;:])\s*\n+', r'\1 ', text)
    text = re.sub(r'\n+', '. ', text)
    text = re.sub(r'\.{2,}', '.', text)
    # Normaliser les espaces
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def split_wolof_text(text: str, max_chars: int = 140) -> list[str]:
    """
    Découpe intelligemment un texte wolof long en segments naturels
    ne dépassant pas max_chars (optimaux pour SpeechT5).
    """
    cleaned = clean_markdown_text(text)
    if not cleaned:
        return []

    # 1. Découpage premier par ponctuations fortes (. ! ? ; :)
    raw_sentences = re.split(r'([.?!;:]+)', cleaned)
    sentences = []
    
    # Réassembler les délimiteurs avec leur phrase
    i = 0
    while i < len(raw_sentences):
        sentence = raw_sentences[i].strip()
        if i + 1 < len(raw_sentences):
            delim = raw_sentences[i+1].strip()
            if delim and not re.search(r'[.?!;:]$', sentence):
                sentence += " " + delim
            i += 2
        else:
            i += 1
        if sentence:
            # Nettoyer les espaces avant ponctuation
            sentence = re.sub(r'\s+([.?!;:])', r'\1', sentence)
            sentences.append(sentence)

    # 2. Découpage secondaire si une phrase est trop longue
    intermediate_chunks = []
    for s in sentences:
        if len(s) <= max_chars:
            intermediate_chunks.append(s)
        else:
            # Découpage par virgules ou conjonctions wolof ("ndax", "waaye", "te", "ak", "ci")
            sub_parts = re.split(r'(,| ndax | waaye | te | ak )', s)
            current_chunk = ""
            for part in sub_parts:
                if len(current_chunk) + len(part) <= max_chars:
                    current_chunk += part
                else:
                    if current_chunk.strip():
                        intermediate_chunks.append(current_chunk.strip())
                    current_chunk = part
            if current_chunk.strip():
                intermediate_chunks.append(current_chunk.strip())

    # 3. Fusion des segments trop courts (< 30 car.) avec le segment suivant pour garantir une bonne synthèse acoustique
    final_chunks = []
    current = ""
    for c in intermediate_chunks:
        c_clean = c.strip()
        if not current:
            current = c_clean
        elif len(current) < 30 or (len(current) + len(c_clean) + 1 <= max_chars):
            current += " " + c_clean
        else:
            final_chunks.append(current.strip())
            current = c_clean
    if current.strip():
        if len(current.strip()) < 30 and final_chunks:
            final_chunks[-1] += " " + current.strip()
        else:
            final_chunks.append(current.strip())

    return [c.strip() for c in final_chunks if c.strip() and len(c.strip()) > 1]

def synthesize_full_text(text: str) -> np.ndarray:
    """
    Synthétise un long texte complet par découpage et concaténation avec micro-silences.
    """
    import torch
    load_tts_model()
    chunks = split_wolof_text(text)
    if not chunks:
        # Si vide, renvoyer un bref silence
        return np.zeros(16000, dtype=np.float32)

    sample_rate = 16000
    # Silence inter-phrases de 250 ms
    silence = np.zeros(int(sample_rate * 0.25), dtype=np.float32)
    audio_segments = []

    print(f"\n[Synthèse Hawa] Découpage en {len(chunks)} segments :")
    for idx, chunk in enumerate(chunks, start=1):
        print(f"  [{idx}/{len(chunks)}] ({len(chunk)} car.) : \"{chunk}\"")
        inputs = processor(text=chunk, return_tensors="pt").to(device)

        with torch.no_grad():
            try:
                speech = model.generate_speech(
                    inputs["input_ids"],
                    speaker_embeddings,
                    vocoder=vocoder
                )
                segment = speech.cpu().numpy()
                audio_segments.append(segment)
                audio_segments.append(silence)
            except Exception as e:
                print(f"    [Avertissement] Erreur sur le segment '{chunk}' : {e}")

    if not audio_segments:
        return np.zeros(16000, dtype=np.float32)

    # Concaténation de tous les morceaux (on retire le dernier silence si présent)
    if len(audio_segments) == 1:
        full_audio = audio_segments[0]
    else:
        full_audio = np.concatenate(audio_segments[:-1])
    
    return full_audio

import threading

is_model_loading = False

def background_load_model():
    global is_model_loading
    is_model_loading = True
    try:
        load_tts_model()
    except Exception as e:
        print(f"[Erreur] Échec du chargement du modèle : {e}")
    finally:
        is_model_loading = False

@app.on_event("startup")
def on_startup():
    print("[Startup] Démarrage du thread de chargement du modèle Hawa...")
    threading.Thread(target=background_load_model, daemon=True).start()

class TTSRequest(BaseModel):
    text: str
    voice: str = "hawa"

@app.get("/health")
def health_check():
    """Vérification de l'état du serveur d'inférence."""
    return {
        "status": "online" if model is not None else ("loading" if is_model_loading else "initializing"),
        "service": "Hawa Wolof TTS Inference Server",
        "model": "SpeechT5-Wolof (bilalfaye)",
        "vocoder": "HiFi-GAN (microsoft)",
        "voice": "Hawa (Casamance Agro Copilot)",
        "device": device,
        "cached_audios": len(os.listdir(CACHE_DIR)) if os.path.exists(CACHE_DIR) else 0
    }

@app.post("/api/tts")
def generate_speech_endpoint(req: TTSRequest):
    """
    Point de terminaison principal pour la synthèse vocale intégrale.
    Prend un texte long en wolof et renvoie un flux WAV prêt à l'écoute.
    """
    clean_text = req.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Texte vide")

    # Clé de cache basée sur le hash du texte
    text_hash = hashlib.sha256(clean_text.encode("utf-8")).hexdigest()[:16]
    cached_file = os.path.join(CACHE_DIR, f"hawa_{text_hash}.wav")

    # Si déjà en cache, renvoyer immédiatement
    if os.path.exists(cached_file):
        print(f"[Cache HIT] Réponse instantanée pour hash {text_hash}")
        return FileResponse(
            cached_file, 
            media_type="audio/wav", 
            filename=f"hawa_{text_hash}.wav"
        )

    print(f"[Cache MISS] Génération neuronale complète pour {len(clean_text)} caractères...")
    try:
        audio_array = synthesize_full_text(clean_text)
        # Sauvegarde dans le cache
        sf.write(cached_file, audio_array, samplerate=16000)

        # Encodage en mémoire pour réponse immédiate
        buffer = io.BytesIO()
        sf.write(buffer, audio_array, samplerate=16000, format="WAV")
        buffer.seek(0)

        return Response(
            content=buffer.read(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f"inline; filename=hawa_{text_hash}.wav",
                "X-Audio-Duration-Sec": str(round(len(audio_array) / 16000.0, 2))
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Erreur d'inférence : {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 65)
    print("  SERVEUR D'INFERENCE HAWA WOLOF EN LIGNE SUR http://localhost:8000")
    print("  Point de terminaison : POST http://localhost:8000/api/tts")
    print("  Health check        : GET  http://localhost:8000/health")
    print("=" * 65 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=8000)
