import { createContext, useContext, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";

export type AssistantThread = { id: string; title: string; messages: UIMessage[] };

const makeThread = (id: string): AssistantThread => ({
  id,
  title: "Nouvelle analyse",
  messages: [
    {
      id: `welcome-${id}`,
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Bonjour. Je suis le copilote opérationnel AGRIFLOW. Je peux comparer les zones, expliquer les indicateurs et relier collecte, producteurs et prévisions à partir des données de démonstration visibles.",
        },
      ],
    },
  ],
});
type SessionValue = {
  threads: AssistantThread[];
  ensureThread: (id: string) => AssistantThread;
  createThread: () => string;
  updateThread: (id: string, messages: UIMessage[]) => void;
  removeThread: (id: string) => string;
};
const SessionContext = createContext<SessionValue | null>(null);

export function AssistantSessionProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const ensureThread = (id: string) => {
    const current = threads.find((t) => t.id === id);
    if (current) return current;
    const created = makeThread(id);
    setThreads((items) => (items.some((t) => t.id === id) ? items : [...items, created]));
    return created;
  };
  const createThread = () => {
    const id = crypto.randomUUID();
    setThreads((items) => [...items, makeThread(id)]);
    return id;
  };
  const updateThread = (id: string, messages: UIMessage[]) => {
    const first = messages
      .find((m) => m.role === "user")
      ?.parts.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join(" ")
      .trim();
    const title = first
      ? `${first.slice(0, 42)}${first.length > 42 ? "…" : ""}`
      : "Nouvelle analyse";
    setThreads((items) => items.map((t) => (t.id === id ? { ...t, title, messages } : t)));
  };
  const removeThread = (id: string) => {
    const remaining = threads.filter((t) => t.id !== id);
    if (remaining[0]) {
      setThreads(remaining);
      return remaining[0].id;
    }
    const next = crypto.randomUUID();
    setThreads([makeThread(next)]);
    return next;
  };
  return (
    <SessionContext.Provider
      value={{ threads, ensureThread, createThread, updateThread, removeThread }}
    >
      {children}
    </SessionContext.Provider>
  );
}
export function useAssistantSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("AssistantSessionProvider is missing");
  return value;
}
