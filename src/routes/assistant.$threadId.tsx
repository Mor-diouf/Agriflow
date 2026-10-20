import { useEffect, useMemo, useRef } from "react";
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
import { useAssistantSession } from "@/lib/assistant-session";

export const Route = createFileRoute("/assistant/$threadId")({
  head: () => ({
    meta: [
      { title: "Conversation AGRIFLOW | SM10 Connect" },
      {
        name: "description",
        content: "Conversation temporaire avec le copilote d’intelligence opérationnelle AGRIFLOW.",
      },
      { property: "og:title", content: "Conversation AGRIFLOW | SM10 Connect" },
      {
        property: "og:description",
        content: "Analyse sourcée des indicateurs de collecte, producteurs et prévisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThreadPage,
});
const transport = new DefaultChatTransport({ api: "/api/chat" });
const prompts = [
  "Quelle zone présente le plus de risque ?",
  "Compare le taux de service par zone",
  "Quand est prévu le pic de récolte ?",
];

function ThreadPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const { threads, ensureThread, createThread, updateThread, removeThread } = useAssistantSession();
  const thread = ensureThread(threadId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: thread.messages,
    transport,
    onFinish: ({ messages: finished }) => updateThread(threadId, finished),
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy, threadId]);
  const threadRows = useMemo(() => (threads.length ? threads : [thread]), [threads, thread]);
  const submit = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    await sendMessage({ text: clean });
  };
  const addThread = () => {
    const id = createThread();
    void navigate({ to: "/assistant/$threadId", params: { threadId: id } });
  };
  const deleteThread = (id: string) => {
    const next = removeThread(id);
    if (id === threadId)
      void navigate({ to: "/assistant/$threadId", params: { threadId: next }, replace: true });
  };
  return (
    <EnterpriseShell
      active="assistant"
      code="INTELLIGENCE / OPERATIONAL COPILOT"
      title="Assistant AGRIFLOW"
      subtitle="Analyses temporaires, sourcées et diffusées en direct."
      status={busy ? "ASSISTANT — ANALYSING" : "ASSISTANT — READY"}
      actions={
        <Button size="sm" onClick={addThread}>
          <MessageSquarePlus />
          Nouvelle conversation
        </Button>
      }
    >
      <div className="assistant-layout assistant-thread-layout">
        <aside className="assistant-context">
          <div className="assistant-identity">
            <img src={copilotMark} alt="Emblème du copilote AGRIFLOW" width={816} height={816} />
            <div>
              <b>AGRIFLOW Copilot</b>
              <p>Intelligence opérationnelle</p>
            </div>
          </div>
          <div className="assistant-thread-heading">
            <p className="eyebrow">CONVERSATIONS DE LA SESSION</p>
            <span>{threadRows.length}</span>
          </div>
          <div className="assistant-thread-list">
            {threadRows.map((item) => (
              <div
                className={`assistant-thread-row ${item.id === threadId ? "assistant-thread-active" : ""}`}
                key={item.id}
              >
                <button
                  type="button"
                  onClick={() =>
                    void navigate({ to: "/assistant/$threadId", params: { threadId: item.id } })
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
          <p className="eyebrow mt-6">SOURCES DISPONIBLES</p>
          <Context
            icon={RouteIcon}
            title="Collection Optimization"
            detail="6 camions · 12 points"
          />
          <Context icon={UsersRound} title="Producer Intelligence" detail="1 284 producteurs" />
          <Context icon={Database} title="Harvest Forecast" detail="6 zones · campagne simulée" />
          <p className="method-note mx-0 mt-6">
            Session temporaire : les conversations disparaissent au rechargement de la page.
          </p>
        </aside>
        <section className="assistant-chat">
          <div className="assistant-status">
            <span className="live-label">LIVE GROUNDED ANALYSIS</span>
            <span>Réponses basées sur le référentiel AGRIFLOW de démonstration</span>
          </div>
          <Conversation>
            <ConversationContent>
              {messages.map((message, index) => {
                const reasoning = message.parts
                  .filter((part) => part.type === "reasoning")
                  .map((part) => part.text)
                  .join("\n\n");
                const isStreaming = busy && index === messages.length - 1;
                return (
                  <Message key={message.id} from={message.role}>
                    <MessageContent>
                      {reasoning && (
                        <Reasoning isStreaming={isStreaming}>
                          <ReasoningTrigger
                            getThinkingMessage={(streaming, duration) =>
                              streaming
                                ? "Analyse en cours…"
                                : `Analyse effectuée${duration ? ` en ${duration} s` : ""}`
                            }
                          />
                          <ReasoningContent>{reasoning}</ReasoningContent>
                        </Reasoning>
                      )}
                      {message.parts.map((part, partIndex) =>
                        part.type === "text" ? (
                          <MessageResponse
                            key={`${message.id}-${partIndex}`}
                            isAnimating={isStreaming}
                          >
                            {part.text}
                          </MessageResponse>
                        ) : null,
                      )}
                    </MessageContent>
                  </Message>
                );
              })}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent>
                    <p className="assistant-thinking">Analyse du référentiel opérationnel…</p>
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
          <div className="suggestion-row">
            {prompts.map((prompt) => (
              <Button
                variant="outline"
                size="sm"
                type="button"
                key={prompt}
                onClick={() => void submit(prompt)}
                disabled={busy}
              >
                {prompt}
              </Button>
            ))}
          </div>
          <PromptInput onSubmit={({ text }) => submit(text)} className="assistant-prompt">
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              placeholder="Interroger les opérations AGRIFLOW…"
              disabled={busy}
            />
            <PromptInputFooter>
              <span className="text-[9px] text-muted-foreground">
                DEMO DATA · SESSION NON CONSERVÉE
              </span>
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
