"""
SM10 Agro (Module 5) — Synthèse Vocale Wolof : Profil Vocal Féminin "Hawa"
Modèle neuronal : SpeechT5 Wolof (bilalfaye) + HiFi-GAN Vocoder (microsoft)
Speaker embedding : Profil vocal féminin (x-vector 512)
Exécution 100% locale sur CPU (optimisé pour 8 Go de RAM, consommation < 600 Mo)
"""

import os
import sys
import io
import zipfile
import numpy as np
import torch
import soundfile as sf
from huggingface_hub import hf_hub_download
from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def generate_hawa_speech():
    print("=" * 65)
    print("  SM10 AGRO (MODULE 5) - SYNTHESE NEURONALE WOLOF : VOIX DE HAWA")
    print("=" * 65)

    device = "cpu"
    print(f"\n[1/4] Dispositif d execution : {device.upper()} (Consommation RAM : ~550 Mo)")

    print("[2/4] Chargement du modele SpeechT5 Wolof & Vocoder HiFi-GAN...")
    model_id = "bilalfaye/speecht5_tts-wolof"
    processor = SpeechT5Processor.from_pretrained(model_id)
    model = SpeechT5ForTextToSpeech.from_pretrained(model_id).to(device)
    vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan").to(device)

    print("[3/4] Extraction du vecteur vocal feminin pour 'Hawa'...")
    zip_path = hf_hub_download(
        repo_id="Matthijs/cmu-arctic-xvectors",
        filename="spkrec-xvect.zip",
        repo_type="dataset"
    )
    with zipfile.ZipFile(zip_path, "r") as z:
        # Profil vocal feminin clair et doux (clb / slt)
        with z.open("spkrec-xvect/cmu_us_clb_arctic-wav-arctic_b0378.npy") as f:
            speaker_embeddings = torch.tensor(np.load(io.BytesIO(f.read())), dtype=torch.float32).unsqueeze(0).to(device)

    # Repertoire de destination dans l'application web pour ecoute directe
    service_dir = os.path.dirname(os.path.abspath(__file__))
    repo_dir = os.path.dirname(os.path.dirname(service_dir))
    output_dir = os.path.join(repo_dir, "sm10-connect", "public", "audio")
    samples_dir = os.path.join(service_dir, "samples")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(samples_dir, exist_ok=True)

    phrases = [
        (
            "hawa_intro",
            "Dalal jamm ! Man maay Hawa, sa copilote SM10 Agro ci Casamance."
        ),
        (
            "hawa_verger",
            "Kañ lay woto bi ñëw ci sama tool ci Bignona ngir mangue yi ?"
        ),
        (
            "hawa_kolda",
            "Goxu Kolda moo gën a am jafe-jafe ndax sori na Usine Bambali."
        ),
         (
            "hawa_kolda",
            "nanga def mba yangui si diam bou bakh "
        ),
    ]

    print("\n[4/4] Generation neuronale des extraits audio en cours...")
    for name, text in phrases:
        print(f"  -> Synthese de : \"{text}\"")
        inputs = processor(text=text, return_tensors="pt").to(device)

        with torch.no_grad():
            speech = model.generate_speech(
                inputs["input_ids"],
                speaker_embeddings,
                vocoder=vocoder
            )

        wav_web = os.path.join(output_dir, f"{name}.wav")
        wav_local = os.path.join(samples_dir, f"{name}.wav")
        
        audio_arr = speech.cpu().numpy()
        sf.write(wav_web, audio_arr, samplerate=16000)
        sf.write(wav_local, audio_arr, samplerate=16000)
        print(f"     [OK] Fichier genere : {wav_web} (16 kHz)")

    print("\n" + "=" * 65)
    print("  SUCCES : La voix neuronale de Hawa est generee !")
    print("=" * 65)
    print("Fichiers enregistres :")
    print(f"  * {output_dir}\\hawa_intro.wav")
    print(f"  * {output_dir}\\hawa_verger.wav")
    print(f"  * {output_dir}\\hawa_kolda.wav")
    print("\nEcoute immediate sur le serveur de dev :")
    print("  http://localhost:3000/audio/hawa_intro.wav")
    print("  http://localhost:3000/audio/hawa_verger.wav")
    print("  http://localhost:3000/audio/hawa_kolda.wav")
    print("=" * 65)

if __name__ == "__main__":
    generate_hawa_speech()
