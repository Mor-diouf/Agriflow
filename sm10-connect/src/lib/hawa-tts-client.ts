/**
 * SM10 Agro — Module 5 : Client d'Inférence Vocale Neuronale Wolof "Hawa"
 * Connecte le frontend React au serveur FastAPI local (hawa_inference_server.py)
 */

export const HAWA_SERVER_URL = "http://localhost:8000";

export type HawaHealth = {
  status: "online" | "loading" | "offline";
  service?: string;
  model?: string;
  voice?: string;
  cached_audios?: number;
};

// Vérifie si le serveur d'inférence Python est actif
export async function checkHawaServerHealth(): Promise<HawaHealth> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${HAWA_SERVER_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return data;
    }
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
}

// Synthétise un texte wolof complet via le serveur d'inférence
export async function requestHawaWolofAudio(text: string): Promise<{ audioUrl: string; durationSec?: number }> {
  const res = await fetch(`${HAWA_SERVER_URL}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice: "hawa",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Erreur serveur Hawa (${res.status}): ${errorText}`);
  }

  const durationHeader = res.headers.get("X-Audio-Duration-Sec");
  const durationSec = durationHeader ? parseFloat(durationHeader) : undefined;

  const blob = await res.blob();
  const audioUrl = URL.createObjectURL(blob);
  return { audioUrl, durationSec };
}
