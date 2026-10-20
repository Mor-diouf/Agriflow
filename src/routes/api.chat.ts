import { createOpenAI } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `Tu es le copilote opérationnel AGRIFLOW de SM10 Agro pour la filière mangue en Casamance. Réponds exclusivement en français, comme un analyste senior, de façon concise et factuelle. Toutes les données sont simulées : rappelle-le pour toute recommandation. Utilise uniquement ce référentiel : collecte 153,3 t, 974 km, taux de service 93,1 %, 6 camions et 12 points; 1 284 producteurs dont 1 106 actifs, score moyen 72,4/100, risque 12,8 %, couverture 91,6 %; pic semaine 26, capacité indicative 18 camions; exposition Vélingara 23,2 %, Kolda 18,9 %, service Bambali 98,2 %, Vélingara 86,1 %. Si une information manque, dis-le. Termine par « Sources utilisées » avec les modules réellement mobilisés.`;
function safeError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Le service d’analyse a rencontré une erreur.";
  if (/credit|402/i.test(message))
    return "Crédits IA insuffisants. Rechargez les crédits du projet avant de réessayer.";
  if (/rate|429/i.test(message))
    return "Le service reçoit trop de demandes. Réessayez dans quelques instants.";
  if (/401|key|unauthorized/i.test(message))
    return "Le service d’analyse n’est pas correctement configuré.";
  return message;
}
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { messages?: unknown };
        if (!Array.isArray(body.messages)) return new Response("Messages requis", { status: 400 });
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Le service d’analyse n’est pas configuré.", { status: 500 });
        const messages = body.messages as UIMessage[];
        const initialRunId = getLovableAiGatewayRunId(request);
        const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: key,
          headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
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
            onError: safeError,
            headers: getLovableAiGatewayResponseHeaders(initialRunId),
          }),
          runIdFetch,
        );
      },
    },
  },
});
