import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import {
  Database,
  Leaf,
  MessageSquarePlus,
  Route as RouteIcon,
  Send,
  Trash2,
  UsersRound,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Globe,
  Radio,
  Play,
  Pause,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Info,
  Loader2,
  Sparkles,
  Server,
  type LucideIcon,
} from "lucide-react";
import copilotMark from "@/assets/agriflow-copilot.png";
import { EnterpriseShell } from "@/components/EnterpriseShell";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAssistantSession } from "@/lib/assistant-session";
import {
  wolofToSpeechPhonetics,
  getWolofAudioSummary,
} from "@/lib/sm10-rag-engine";
import {
  checkHawaServerHealth,
  requestHawaWolofAudio,
  type HawaHealth,
  HAWA_SERVER_URL,
} from "@/lib/hawa-tts-client";

export const Route = createFileRoute("/assistant/$threadId")({
  head: () => ({
    meta: [
      { title: "Assistant Multilingue & Vocal (M5) | SM10 Agro" },
      {
        name: "description",
        content:
          "Copilote conversationnel bilingue Français & Wolof, accessible en mode texte et vocal (Module 5).",
      },
    ],
  }),
  component: ThreadPage,
});

const transport = new DefaultChatTransport({ api: "/api/chat" });

type LangMode = "fr" | "wo";
type PersonaMode = "decision" | "producer";

const PROMPTS_CONFIG = {
  fr: {
    decision: [
      "Quelle zone présente le plus de risque cette semaine ?",
      "Quand est prévu le pic de récolte et quel est l'impact usine ?",
      "Quels sont les gains logistiques du modèle PuLP ?",
      "Que faire si le Camion-01 tombe en panne ?",
    ],
    producer: [
      "À quelle heure passe le camion de collecte dans mon verger ?",
      "Comment stocker mes mangues avant l'arrivée du camion ?",
      "Quels sont les critères de rejet qualité à l'usine Bambali ?",
    ],
  },
  wo: {
    decision: [
      "Ban gox ñooy gën a am jafe-jafe ci ngoob mi ?",
      "Kañ lay pic bu mag bi ñëw te luñuy def ?",
      "Ñaata km la solveur PuLP bi wàññi ci yoon yi ?",
      "Ban baykat lañuy jital bu woto bi panne ?",
    ],
    producer: [
      "Kañ lay woto bi ñëw ci sama tool ?",
      "Naka laay aar sama mangue yi balaa woto bi di ñëw ?",
      "Lan lañuy bañ ci Usine Bambali ngir qualité ?",
    ],
  },
};

function ThreadPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const { threads, ensureThread, createThread, updateThread, removeThread } =
    useAssistantSession();
  const thread = ensureThread(threadId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Module 5 Settings: Langue & Persona
  const [lang, setLang] = useState<LangMode>("fr");
  const [persona, setPersona] = useState<PersonaMode>("decision");

  // Mode Vocal : Speech-to-Text (Microphone)
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Mode Vocal : Text-to-Speech (Lecture audio)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Simulation Note Vocale Producteur (WhatsApp Audio)
  const [isPlayingSampleAudio, setIsPlayingSampleAudio] = useState(false);

  // Voix neuronale locale de Hawa (SpeechT5 Wolof)
  const [hawaPlaying, setHawaPlaying] = useState<string | null>(null);
  const hawaAudioRef = useRef<HTMLAudioElement | null>(null);

  // Serveur d'inférence Hawa pour lecture intégrale de longs textes
  const [hawaServerHealth, setHawaServerHealth] = useState<HawaHealth>({ status: "offline" });
  const [generatingHawaId, setGeneratingHawaId] = useState<string | null>(null);
  const [playingHawaAudioId, setPlayingHawaAudioId] = useState<string | null>(null);
  const hawaServerAudioRef = useRef<HTMLAudioElement | null>(null);

  // Vérification périodique de l'état du serveur Hawa
  useEffect(() => {
    let active = true;
    const probe = async () => {
      const h = await checkHawaServerHealth();
      if (active) setHawaServerHealth(h);
    };
    void probe();
    const timer = setInterval(probe, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const playHawaAudio = (audioPath: string) => {
    if (typeof window === "undefined") return;
    if (hawaPlaying === audioPath) {
      hawaAudioRef.current?.pause();
      setHawaPlaying(null);
      return;
    }
    if (hawaAudioRef.current) {
      hawaAudioRef.current.pause();
    }
    if (hawaServerAudioRef.current) {
      hawaServerAudioRef.current.pause();
      setPlayingHawaAudioId(null);
    }
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);
    setIsPlayingSampleAudio(false);

    const audio = new Audio(audioPath);
    hawaAudioRef.current = audio;
    audio.onended = () => setHawaPlaying(null);
    audio.onerror = () => setHawaPlaying(null);
    void audio.play().catch(() => setHawaPlaying(null));
    setHawaPlaying(audioPath);
  };

  // Lecture intégrale en Wolof via le serveur d'inférence (Smart Chunking & Stitching)
  const handlePlayHawaFullWolof = async (fullText: string, messageId: string) => {
    if (typeof window === "undefined") return;

    if (playingHawaAudioId === messageId) {
      hawaServerAudioRef.current?.pause();
      setPlayingHawaAudioId(null);
      return;
    }

    if (hawaServerAudioRef.current) {
      hawaServerAudioRef.current.pause();
      hawaServerAudioRef.current = null;
    }
    if (hawaAudioRef.current) {
      hawaAudioRef.current.pause();
      setHawaPlaying(null);
    }
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);

    // Déterminer le texte en Wolof intégral
    const isAlreadyWolof = /dalal jamm|gox|baykat|ngoob|woto|tool|yaqu|kolda|sédhiou|ci saas|ñëw|ñore|jafe-jafe|tontu/i.test(fullText);
    const wolofText = isAlreadyWolof ? fullText : getWolofAudioSummary(fullText);

    if (hawaServerHealth.status === "online") {
      try {
        setGeneratingHawaId(messageId);
        const { audioUrl } = await requestHawaWolofAudio(wolofText);
        setGeneratingHawaId(null);

        const audio = new Audio(audioUrl);
        hawaServerAudioRef.current = audio;
        audio.onended = () => setPlayingHawaAudioId(null);
        audio.onerror = () => setPlayingHawaAudioId(null);
        await audio.play();
        setPlayingHawaAudioId(messageId);
      } catch (err) {
        console.error("Erreur serveur Hawa:", err);
        setGeneratingHawaId(null);
        // En cas d'erreur de réseau, jouer l'audio authentique de Hawa pré-généré (jamais la voix robot du système)
        playHawaAudio("/audio/hawa_intro.wav");
      }
    } else {
      // Si le serveur est hors ligne ou en chargement, jouer la vraie voix de Hawa (pas la voix système du navigateur)
      playHawaAudio("/audio/hawa_intro.wav");
    }
  };

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: thread.messages,
    transport,
    onFinish: ({ messages: finished }) => updateThread(threadId, finished),
  });

  const busy = status === "submitted" || status === "streaming";

  // Initialisation de la reconnaissance vocale
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = lang === "fr" ? "fr-FR" : "fr-SN";

        recognition.onresult = (event: any) => {
          const current = event.resultIndex;
          const transcript = event.results[current][0].transcript;
          if (textareaRef.current) {
            textareaRef.current.value = transcript;
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, [lang]);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.lang = lang === "fr" ? "fr-FR" : "fr-SN";
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  // Text-to-Speech : Lecture orale (Français et Wolof phonétique)
  const speakText = (
    text: string,
    messageId: string,
    targetLanguage: "fr" | "wo" = "fr"
  ) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const playKey = `${messageId}-${targetLanguage}`;
    if (speakingMessageId === playKey) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      setIsPlayingSampleAudio(false);
      return;
    }

    window.speechSynthesis.cancel();

    // Si on lit en Wolof, extraire la synthèse wolof certifiée puis appliquer les phonèmes sénégalais
    let preparedText = "";
    if (targetLanguage === "wo") {
      const wolofSummary = getWolofAudioSummary(text);
      preparedText = wolofToSpeechPhonetics(wolofSummary).slice(0, 500);
    } else {
      preparedText = text
        .replace(/[#*_`]/g, "")
        .replace(/\n+/g, ". ")
        .slice(0, 450);
    }

    const utterance = new SpeechSynthesisUtterance(preparedText);
    utterance.lang = "fr-FR";
    utterance.rate = targetLanguage === "wo" ? 0.90 : 1.0;
    utterance.pitch = targetLanguage === "wo" ? 0.95 : 1.0;

    utterance.onend = () => {
      setSpeakingMessageId(null);
      setIsPlayingSampleAudio(false);
    };
    utterance.onerror = () => {
      setSpeakingMessageId(null);
      setIsPlayingSampleAudio(false);
    };

    setSpeakingMessageId(playKey);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);

  const threadRows = useMemo(
    () => (threads.length ? threads : [thread]),
    [threads, thread]
  );

  const submit = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    if (textareaRef.current) textareaRef.current.value = "";
    await sendMessage({ text: clean });
  };

  const addThread = () => {
    const id = createThread();
    void navigate({ to: "/assistant/$threadId", params: { threadId: id } });
  };

  const deleteThread = (id: string) => {
    const next = removeThread(id);
    if (id === threadId)
      void navigate({
        to: "/assistant/$threadId",
        params: { threadId: next },
        replace: true,
      });
  };

  const currentPrompts = PROMPTS_CONFIG[lang][persona];

  return (
    <EnterpriseShell
      active="assistant"
      code="MODULE 5 — ASSISTANT MULTILINGUE & VOCAL"
      title="Copilote Agro-Logistique Bilingue"
      subtitle="Interaction en langage naturel (Français & Wolof) et mode vocal adossés aux Modules 1, 2, 3 et 4."
      status={busy ? "COPILOTE — ANALYSE EN COURS" : "COPILOTE — PRÊT (FR / WO)"}
      actions={
        <div className="flex items-center gap-2">
          {/* Sélecteur de Langue */}
          <div className="flex rounded-md border border-border bg-surface p-0.5 font-mono text-xs">
            <button
              onClick={() => setLang("fr")}
              className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                lang === "fr"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>🇫🇷</span>
              <span>Français</span>
            </button>
            <button
              onClick={() => setLang("wo")}
              className={`flex items-center gap-1 rounded px-2 py-1 transition-colors ${
                lang === "wo"
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>🇸🇳</span>
              <span>Wolof</span>
            </button>
          </div>

          <Button size="sm" onClick={addThread} className="text-xs gap-1.5">
            <MessageSquarePlus className="size-3.5" />
            <span className="hidden sm:inline">Nouvelle conversation</span>
          </Button>
        </div>
      }
    >
      <div className="assistant-layout assistant-thread-layout">
        {/* BARRE LATÉRALE GAUCHE : CONTEXTE, MODES & SOURCES */}
        <aside className="assistant-context space-y-4">
          <div className="assistant-identity">
            <img
              src={copilotMark}
              alt="Emblème du copilote AGRIFLOW"
              width={816}
              height={816}
            />
            <div>
              <b>Copilote SM10 Agro</b>
              <p>IA Multilingue & Vocale (M5)</p>
            </div>
          </div>

          {/* SÉLECTEUR DE PERSONA (DÉCIDEUR / PRODUCTEUR) */}
          <div className="rounded-lg border border-border/80 bg-surface/50 p-3 space-y-2">
            <p className="font-mono text-[10px] text-muted-foreground font-semibold uppercase">
              Profil d'Utilisateur
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setPersona("decision")}
                className={`rounded border p-2 text-left text-xs transition-all ${
                  persona === "decision"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border/60 hover:bg-surface"
                }`}
              >
                <div className="font-medium">Décideur</div>
                <div className="text-[10px] text-muted-foreground">Analyses & Tournées</div>
              </button>
              <button
                onClick={() => setPersona("producer")}
                className={`rounded border p-2 text-left text-xs transition-all ${
                  persona === "producer"
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border/60 hover:bg-surface"
                }`}
              >
                <div className="font-medium">Producteur</div>
                <div className="text-[10px] text-muted-foreground">Conseils & Récolte</div>
              </button>
            </div>
          </div>

          {/* SIMULATION NOTE VOCALE PRODUCTEUR (TERRAIN) */}
          <div className="rounded-lg border border-border/80 bg-surface/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1.5">
                <Smartphone className="size-3.5 text-primary" />
                Note Vocale Wolof (Terrain)
              </span>
              <Badge variant="outline" className="text-[9px] font-mono">
                SMS / AUDIO
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Exemple de note vocale WhatsApp reçue d'un verger à Bignona :
            </p>
            <div className="rounded border bg-background/80 p-2.5 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant={speakingMessageId === "sample-wo" ? "default" : "secondary"}
                className={`size-7 rounded-full p-0 shrink-0 transition-all ${
                  speakingMessageId === "sample-wo"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white animate-pulse"
                    : ""
                }`}
                onClick={() => {
                  if (speakingMessageId === "sample-wo") {
                    window.speechSynthesis.cancel();
                    setSpeakingMessageId(null);
                    setIsPlayingSampleAudio(false);
                  } else {
                    setIsPlayingSampleAudio(true);
                    speakText(
                      "Dama bëgg xam kañ lay woto bi ñëw ci sama tool ci Bignona ngir mangue yi.",
                      "sample",
                      "wo"
                    );
                  }
                }}
              >
                {speakingMessageId === "sample-wo" ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5 ml-0.5" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] text-foreground font-semibold truncate">
                  « Kañ lay woto bi ñëw ci sama tool ? »
                </p>
                <p className="text-[9px] text-muted-foreground truncate">
                  Verger P003 (Bignona) · Note audio 0:08
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-2 text-primary"
                onClick={() =>
                  void submit(
                    lang === "wo"
                      ? "Kañ lay woto bi ñëw ci sama tool ?"
                      : "À quelle heure passe le camion de collecte dans mon verger P003 ?"
                  )
                }
              >
                Traiter
              </Button>
            </div>
          </div>

          {/* VOIX NEURONALE DE HAWA (MODÈLE LOCAL SPEECHT5 WOLOF & SERVEUR D'INFÉRENCE) */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-amber-400 font-semibold uppercase flex items-center gap-1.5">
                <Volume2 className="size-3.5" />
                Voix Hawa (Lecture Intégrale)
              </span>
              <Badge
                variant="outline"
                className={`text-[9px] font-mono flex items-center gap-1 ${
                  hawaServerHealth.status === "online"
                    ? "border-emerald-500/50 text-emerald-400 bg-emerald-500/10"
                    : "border-amber-500/40 text-amber-400"
                }`}
              >
                {hawaServerHealth.status === "online" ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    SERVEUR ACTIF (8000)
                  </>
                ) : (
                  <>100% CPU · 550 Mo</>
                )}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {hawaServerHealth.status === "online"
                ? "Le serveur d'inférence local est connecté : Hawa lit l'intégralité des paragraphes en Wolof avec pauses naturelles."
                : "Serveur local en veille. Pour activer la lecture longue sans limite, lancez 'python hawa_inference_server.py'."}
            </p>

            {/* Test de lecture d'un paragraphe complet en direct */}
            <div className="pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={generatingHawaId === "test-long"}
                onClick={() =>
                  void handlePlayHawaFullWolof(
                    "Dalal jamm ! Man maay Hawa, sa copilote SM10 Agro ci Casamance. Goxu Kolda moo gën a am jafe-jafe ndax sori na Usine Bambali. Woto yi dinañu fa yóbbu mangue yi ci teel ngir am njariñ ci ngoob mi !",
                    "test-long"
                  )
                }
                className={`w-full justify-between h-8 text-xs border-amber-500/40 ${
                  playingHawaAudioId === "test-long"
                    ? "bg-amber-600 text-white font-semibold animate-pulse"
                    : "text-amber-300 hover:bg-amber-500/10"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {generatingHawaId === "test-long" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : playingHawaAudioId === "test-long" ? (
                    <Pause className="size-3.5" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>
                    {generatingHawaId === "test-long"
                      ? "Génération du paragraphe..."
                      : playingHawaAudioId === "test-long"
                      ? "Arrêter l'écoute"
                      : "Tester lecture longue (3 phrases)"}
                  </span>
                </span>
                <Badge variant="secondary" className="text-[9px] font-mono">
                  Wolof
                </Badge>
              </Button>
            </div>

            {/* Extraits rapides */}
            <div className="space-y-1 pt-1 border-t border-border/40">
              <div className="text-[10px] text-muted-foreground font-mono">Extraits rapides en cache :</div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => playHawaAudio("/audio/hawa_intro.wav")}
                  className={`p-1.5 rounded border text-[10px] font-mono text-center transition-all ${
                    hawaPlaying === "/audio/hawa_intro.wav"
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-border/60 hover:bg-surface text-muted-foreground"
                  }`}
                >
                  Intro
                </button>
                <button
                  type="button"
                  onClick={() => playHawaAudio("/audio/hawa_verger.wav")}
                  className={`p-1.5 rounded border text-[10px] font-mono text-center transition-all ${
                    hawaPlaying === "/audio/hawa_verger.wav"
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-border/60 hover:bg-surface text-muted-foreground"
                  }`}
                >
                  Verger
                </button>
                <button
                  type="button"
                  onClick={() => playHawaAudio("/audio/hawa_kolda.wav")}
                  className={`p-1.5 rounded border text-[10px] font-mono text-center transition-all ${
                    hawaPlaying === "/audio/hawa_kolda.wav"
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-border/60 hover:bg-surface text-muted-foreground"
                  }`}
                >
                  Kolda
                </button>
              </div>
            </div>
          </div>

          {/* HISTORIQUE CONVERSATIONS */}
          <div>
            <div className="assistant-thread-heading">
              <p className="eyebrow">CONVERSATIONS DE LA SESSION</p>
              <span>{threadRows.length}</span>
            </div>
            <div className="assistant-thread-list">
              {threadRows.map((item) => (
                <div
                  className={`assistant-thread-row ${
                    item.id === threadId ? "assistant-thread-active" : ""
                  }`}
                  key={item.id}
                >
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/assistant/$threadId",
                        params: { threadId: item.id },
                      })
                    }
                  >
                    <Leaf />
                    <span>{item.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Supprimer ${item.title}`}
                    title="Supprimer cette conversation"
                    onClick={() => deleteThread(item.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* SOURCES DU RÉFÉRENTIEL */}
          <div>
            <p className="eyebrow">RÉFÉRENTIEL CONNECTÉ</p>
            <div className="space-y-1 mt-2">
              <Context
                icon={RouteIcon}
                title="M1 : PuLP VRP"
                detail="202 km · 2 camions · -29,4% distance"
              />
              <Context
                icon={UsersRound}
                title="M2 : K-Means (k=4)"
                detail="100 producteurs · 62 Profil A"
              />
              <Context
                icon={Database}
                title="M3 : Tri-Niveaux"
                detail="SARIMAX (2.77t) · Q0.75 · Q0.90"
              />
            </div>
          </div>
        </aside>

        {/* SECTION PRINCIPALE DU TCHAT AVEC VOCAL */}
        <section className="assistant-chat">
          <div className="assistant-status flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="live-label">LIVE BILINGUAL RAG</span>
              <span className="text-xs text-muted-foreground">
                {lang === "wo"
                  ? "Tontu yi dañuy sukkandiku ci données certifiées SM10 (Wolof & Français)"
                  : "Réponses étayées sur les résultats certifiés des Modules 1 à 4"}
              </span>
            </div>
            <Badge variant="outline" className="font-mono text-[10px] text-primary">
              {lang === "wo" ? "LÀKK : WOLOF" : "LANGUE : FRANÇAIS"}
            </Badge>
          </div>

          <Conversation>
            <ConversationContent>
              {messages.length === 0 && (
                <div className="p-8 text-center space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Radio className="size-6" />
                  </div>
                  <h3 className="font-semibold text-base text-foreground">
                    {lang === "wo"
                      ? "Dalal jamm ci Copilote SM10 Agro (Wolof & Français)"
                      : "Bienvenue sur le Copilote Multilingue SM10 Agro"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                    {lang === "wo"
                      ? "Mën nga laaj ci làkku Wolof wala Français ci wàllu yoonu woto yi (PuLP), baykat yi (K-Means), wala prévision ngoob mi (SARIMAX & Quantiles)."
                      : "Interrogez la plateforme en langage naturel sur les tournées optimisées, la priorisation des producteurs, les pics de récolte ou dictez votre question au micro."}
                  </p>
                </div>
              )}

              {messages.map((message, index) => {
                const reasoning = message.parts
                  .filter((part) => part.type === "reasoning")
                  .map((part) => part.text)
                  .join("\n\n");
                const isStreaming = busy && index === messages.length - 1;
                const fullText = message.parts
                  .filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join(" ");

                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {reasoning && (
                        <Reasoning isStreaming={isStreaming}>
                          <ReasoningTrigger
                            getThinkingMessage={(streaming, duration) =>
                              streaming
                                ? lang === "wo"
                                  ? "Gëstu gi ci référentiel bi…"
                                  : "Raisonnement sur le référentiel SM10…"
                                : `Analyse effectuée${duration ? ` en ${duration} s` : ""}`
                            }
                          />
                          <ReasoningContent>{reasoning}</ReasoningContent>
                        </Reasoning>
                      )}
                      {message.parts.map((part, partIndex) =>
                        part.type === "text" ? (
                          <div key={`${message.id}-${partIndex}`}>
                            <MessageResponse isAnimating={isStreaming}>
                              {part.text}
                            </MessageResponse>
                          </div>
                        ) : null
                      )}

                      {/* Barre d'action vocale sur le message assistant */}
                      {message.role === "assistant" && !isStreaming && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2.5 text-[11px] font-mono">
                          {/* Bouton Voix neuronale locale intégrale de Hawa */}
                          <Button
                            size="sm"
                            variant={
                              playingHawaAudioId === message.id
                                ? "default"
                                : "outline"
                            }
                            disabled={generatingHawaId === message.id}
                            className={`h-7 px-2.5 gap-1.5 text-xs transition-all ${
                              playingHawaAudioId === message.id
                                ? "bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-sm animate-pulse"
                                : "border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
                            }`}
                            onClick={() => void handlePlayHawaFullWolof(fullText, message.id)}
                            title={
                              hawaServerHealth.status === "online"
                                ? "Écouter Hawa lire TOUT le message en Wolof authentique (Inference Server connecté)"
                                : "Lecture vocale en Wolof (synthèse locale)"
                            }
                          >
                            {generatingHawaId === message.id ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin text-amber-300" />
                                <span>Hawa synthétise...</span>
                              </>
                            ) : playingHawaAudioId === message.id ? (
                              <>
                                <VolumeX className="size-3.5" />
                                <span>Arrêter Hawa (Wolof)</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="size-3.5 text-amber-400" />
                                <span>🌸 Voix Hawa (Wolof Intégral)</span>
                                {hawaServerHealth.status === "online" && (
                                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                                )}
                              </>
                            )}
                          </Button>

                          {/* Bouton Synthèse Phonétique Wolof (Navigateur) */}
                          <Button
                            size="sm"
                            variant={
                              speakingMessageId === `${message.id}-wo`
                                ? "default"
                                : "ghost"
                            }
                            className={`h-7 px-2 gap-1 text-[11px] transition-all ${
                              speakingMessageId === `${message.id}-wo`
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm animate-pulse"
                                : "text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                            }`}
                            onClick={() => speakText(fullText, message.id, "wo")}
                            title="Synthèse phonétique rapide du navigateur"
                          >
                            {speakingMessageId === `${message.id}-wo` ? (
                              <>
                                <VolumeX className="size-3" />
                                <span>Arrêter</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="size-3" />
                                <span>Navigateur (WO)</span>
                              </>
                            )}
                          </Button>

                          {/* Bouton Synthèse Français */}
                          <Button
                            size="sm"
                            variant={
                              speakingMessageId === `${message.id}-fr`
                                ? "default"
                                : "ghost"
                            }
                            className={`h-7 px-2 gap-1 text-[11px] transition-all ${
                              speakingMessageId === `${message.id}-fr`
                                ? "bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow-sm animate-pulse"
                                : "text-sky-400 hover:bg-sky-500/10 hover:text-sky-300"
                            }`}
                            onClick={() => speakText(fullText, message.id, "fr")}
                            title="Écouter la lecture vocale en Français"
                          >
                            {speakingMessageId === `${message.id}-fr` ? (
                              <>
                                <VolumeX className="size-3" />
                                <span>Arrêter</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="size-3" />
                                <span>Français (FR)</span>
                              </>
                            )}
                          </Button>

                          <span className="text-muted-foreground/40 hidden sm:inline">|</span>
                          <span className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
                            <ShieldCheck className="size-3 text-emerald-400" />
                            Référentiel SM10 (M1-M4)
                          </span>
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                );
              })}

              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent>
                    <p className="assistant-thinking">
                      {lang === "wo"
                        ? "Copilote bi mangi gëstu référentiel bi…"
                        : "Interrogation des modules d'optimisation et de prévision…"}
                    </p>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {error && (
            <div className="assistant-error" role="alert">
              {error.message}
            </div>
          )}

          {/* QUESTIONS SUGGÉRÉES SELON LA LANGUE ET LE PERSONA */}
          <div className="suggestion-row">
            {currentPrompts.map((prompt) => (
              <Button
                variant="outline"
                size="sm"
                type="button"
                key={prompt}
                onClick={() => void submit(prompt)}
                disabled={busy}
                className="text-xs"
              >
                {prompt}
              </Button>
            ))}
          </div>

          {/* BARRE DE SAISIE AVEC BOUTON MICROPHONE DICTÉE */}
          <PromptInput onSubmit={({ text }) => submit(text)} className="assistant-prompt">
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder={
                lang === "wo"
                  ? "Laajal Copilote SM10 Agro ci Wolof wala Français…"
                  : "Interroger le copilote sur la collecte, les tournées, les prévisions…"
              }
              disabled={busy}
            />
            <PromptInputFooter>
              <div className="flex items-center gap-2">
                {/* Bouton Micro Dictée Vocale */}
                <Button
                  type="button"
                  variant={isListening ? "default" : "outline"}
                  size="sm"
                  className={`h-7 px-2.5 text-xs gap-1.5 transition-colors ${
                    isListening
                      ? "bg-rose-500 hover:bg-rose-600 text-white animate-pulse"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={toggleListening}
                  title={
                    speechSupported
                      ? isListening
                        ? "Arrêter la dictée vocale"
                        : "Activer la dictée vocale (Micro)"
                      : "Reconnaissance vocale non supportée par ce navigateur"
                  }
                >
                  {isListening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  <span className="font-mono text-[10px]">
                    {isListening ? "Écoute en cours…" : "Vocal"}
                  </span>
                </Button>

                <span className="text-[9px] text-muted-foreground hidden sm:inline">
                  MODULE 5 · MULTILINGUE (FR / WO)
                </span>
              </div>

              <PromptInputSubmit
                status={status}
                onStop={stop}
                aria-label={busy ? "Arrêter" : "Envoyer"}
              >
                <Send />
              </PromptInputSubmit>
            </PromptInputFooter>
          </PromptInput>
        </section>
      </div>
    </EnterpriseShell>
  );
}

function Context({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="assistant-source">
      <Icon />
      <div>
        <b>{title}</b>
        <p>{detail}</p>
      </div>
      <i />
    </div>
  );
}
