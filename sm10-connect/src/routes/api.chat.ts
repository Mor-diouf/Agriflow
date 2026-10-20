import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import { generateRagResponse } from "@/lib/sm10-rag-engine";

const SYSTEM_PROMPT = `Tu es le copilote opérationnel et multilingue (Français & Wolof) AGRIFLOW de SM10 Agro pour la filière mangue en Casamance (Module 5).
Tu réponds aux décideurs et aux producteurs de façon rigoureuse, concise et factuelle.
Tu maîtrises le Français et le Wolof :
- Si la question est en Wolof, réponds en Wolof avec une synthèse en Français si utile.
- Si la question est en Français, réponds en Français.
Utilise exclusivement le référentiel certifié des Modules 1 à 4 :
- Module 1 (Tournées PuLP) : 202 km par rotation (vs 286 km baseline, -29,4%), 2,166 t de pertes évitées, 85 850 FCFA carburant, 242,4 kg CO2. Flotte : CAMION-01 (10t frigo, M. Diatta) et CAMION-02 (8t bâché, A. Sambou) + CAMION-R3 en réserve.
- Module 2 (Producteurs K-Means k=4) : 100 producteurs scorés en Casamance, 62 Profil A (Stratégiques, score logistique moyen 54.3, régularité >90%) et 38 Profil B (Réguliers).
- Module 3 (Prévision Multi-Niveaux) : Hurdle-SARIMAX(1,0,0)+Exog (MAE 2,77 t) pour le flux central ; Hurdle-Quantile(0.75) pour le planning prudent ; Hurdle-Quantile(0.90) pour le stress-test des hauts volumes (Biais S1 = -0,28 t).
- Module 4 (Scénarios) : Saturation usine nominale à 78,5% (128,4 t/sem / 163,5 t capacité) ; pic sévère à 121,5% (198,6 t/sem) nécessitant le CAMION-R3 et passage en 2x8 ; panne CAMION-01 avec arbitrage prioritaire sur les 62 producteurs Profil A.
Termine toujours par « Sources utilisées : » en citant les modules mobilisés.`;

function createLocalRagStreamResponse(userQuery: string): Response {
  const rag = generateRagResponse(userQuery);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 1. Reasoning start
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "reasoning-start", id: "r-0" })}\n\n`)
      );

      // Reasoning delta
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "reasoning-delta",
            id: "r-0",
            delta: rag.reasoning,
          })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "reasoning-end", id: "r-0" })}\n\n`)
      );

      // 2. Text start
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "text-start", id: "t-0" })}\n\n`)
      );

      // Stream text in small word chunks for a natural live typing effect
      const words = rag.answer.split(" ");
      for (let i = 0; i < words.length; i += 4) {
        const chunk = words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "");
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "text-delta",
              id: "t-0",
              delta: chunk,
            })}\n\n`
          )
        );
      }

      // Sources
      const sourcesText = `\n\n---\n**Sources utilisées :**\n${rag.sources
        .map((s) => `- ${s}`)
        .join("\n")}`;

      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "text-delta",
            id: "t-0",
            delta: sourcesText,
          })}\n\n`
        )
      );

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "text-end", id: "t-0" })}\n\n`)
      );

      // 3. Finish
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "finish", finishReason: "stop" })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: unknown };
        if (!Array.isArray(body.messages))
          return new Response("Messages requis", { status: 400 });

        const messages = body.messages as UIMessage[];
        const latestMsg = messages[messages.length - 1];
        const latestText =
          latestMsg?.parts
            ?.filter((p) => p.type === "text")
            ?.map((p: any) => p.text)
            ?.join(" ") ?? "";

        const key = process.env["LOVABLE_API_KEY"];

        // Si la clé API Lovable n'est pas présente, basculer sur le moteur RAG déterministe certifié
        if (!key) {
          return createLocalRagStreamResponse(latestText || "Présentation");
        }

        try {
          const initialRunId = getLovableAiGatewayRunId(request);
          const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
          const provider = createOpenAI({
            baseURL: "https://ai.gateway.lovable.dev/v1",
            apiKey: key,
            headers: {
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "vercel-ai-sdk",
            },
            fetch: runIdFetch.fetch,
          });

          const result = streamText({
            model: provider.responses("openai/gpt-6-astra"),
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages),
            abortSignal: request.signal,
            providerOptions: {
              openai: {
                forceReasoning: true,
                reasoningEffort: "medium",
                reasoningSummary: "auto",
                store: false,
                include: ["reasoning.encrypted_content"],
              },
            },
          });

          return withLovableAiGatewayRunIdHeader(
            result.toUIMessageStreamResponse({
              originalMessages: messages,
              sendReasoning: true,
              onError: () => "Erreur de connexion gateway",
              headers: getLovableAiGatewayResponseHeaders(initialRunId),
            }),
            runIdFetch
          );
        } catch {
          // En cas de panne gateway/crédits, le moteur RAG local prend le relais de façon transparente
          return createLocalRagStreamResponse(latestText || "Présentation");
        }
      },
    },
  },
});
