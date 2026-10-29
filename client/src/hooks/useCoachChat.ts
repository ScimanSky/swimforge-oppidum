import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Message as ChatMessage } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";

const CHAT_STORAGE_KEY_BASE = "coach_chat_history_v1";
const CHAT_GOAL_STORAGE_KEY_BASE = "coach_chat_goal_v1";
const CHAT_CONSTRAINTS_STORAGE_KEY_BASE = "coach_chat_constraints_v1";
export const CHAT_MAX_MESSAGE_CHARS = 2000;
const CHAT_MAX_HISTORY = 20;

export type ChatProvider = "forge" | "gemini" | "rule_based";

const clampChatContent = (value: string) => {
  const normalized = value.trim();
  if (normalized.length <= CHAT_MAX_MESSAGE_CHARS) return normalized;
  return `${normalized.slice(0, CHAT_MAX_MESSAGE_CHARS - 1).trimEnd()}…`;
};

const sanitizeChatMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages
    .map(
      (item): ChatMessage => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: clampChatContent(String(item.content ?? "")),
      })
    )
    .filter(item => item.content.length > 0)
    .slice(-CHAT_MAX_HISTORY);

const scopedStorageKey = (baseKey: string, userId: number) => `${baseKey}:u:${userId}`;

/** Messages kept in storage: only well-formed user/assistant entries, clamped, last 20. */
const readStoredMessages = (raw: string | null): ChatMessage[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitizeChatMessages(
      parsed.filter(
        item =>
          item &&
          typeof item === "object" &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string"
      )
    );
  } catch {
    // Ignore corrupted local chat storage
    return [];
  }
};

/**
 * Coach AI chat state: history, goal and constraints persisted per user (`…:u:<id>`, nothing
 * stored before the user is known), sending with the 2000-character clamp, the «modalità base»
 * warning once per fallback streak, and clearing.
 */
export function useCoachChat(userId: number | null | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [goal, setGoal] = useState("");
  const [constraints, setConstraints] = useState("");
  const [provider, setProvider] = useState<ChatProvider | null>(null);
  const fallbackToastShownRef = useRef(false);
  const chatMutation = trpc.aiCoach.chat.useMutation();

  const storageKeys = useMemo(() => {
    if (!userId || !Number.isFinite(userId) || userId <= 0) return null;
    return {
      history: scopedStorageKey(CHAT_STORAGE_KEY_BASE, userId),
      goal: scopedStorageKey(CHAT_GOAL_STORAGE_KEY_BASE, userId),
      constraints: scopedStorageKey(CHAT_CONSTRAINTS_STORAGE_KEY_BASE, userId),
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKeys) return;

    // Reset in-memory state whenever account scope changes, then load scoped data.
    setMessages(readStoredMessages(window.localStorage.getItem(storageKeys.history)));
    setGoal(window.localStorage.getItem(storageKeys.goal) || "");
    setConstraints(window.localStorage.getItem(storageKeys.constraints) || "");
    setProvider(null);

    // Cleanup legacy non-scoped keys to prevent accidental cross-account reuse.
    window.localStorage.removeItem(CHAT_STORAGE_KEY_BASE);
    window.localStorage.removeItem(CHAT_GOAL_STORAGE_KEY_BASE);
    window.localStorage.removeItem(CHAT_CONSTRAINTS_STORAGE_KEY_BASE);
  }, [storageKeys]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKeys) return;
    try {
      window.localStorage.setItem(storageKeys.history, JSON.stringify(sanitizeChatMessages(messages)));
    } catch {
      // Best-effort persistence
    }
  }, [messages, storageKeys]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKeys) return;
    window.localStorage.setItem(storageKeys.goal, goal);
  }, [goal, storageKeys]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storageKeys) return;
    window.localStorage.setItem(storageKeys.constraints, constraints);
  }, [constraints, storageKeys]);

  const send = async (content: string) => {
    if (chatMutation.isPending) return;

    const originalTrimmed = content.trim();
    const normalizedUserContent = clampChatContent(originalTrimmed);
    if (!normalizedUserContent) return;
    if (originalTrimmed.length > CHAT_MAX_MESSAGE_CHARS) {
      toast.info("Messaggio troppo lungo: inviati i primi 2000 caratteri.");
    }

    const userMessage: ChatMessage = { role: "user", content: normalizedUserContent };
    const nextMessages = sanitizeChatMessages([...messages, userMessage]);
    setMessages(nextMessages);

    try {
      const response = await chatMutation.mutateAsync({
        messages: nextMessages.map(msg => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: clampChatContent(msg.content),
        })),
        goal: goal.trim() || null,
        constraints: constraints.trim() || null,
      });

      const assistantContent = clampChatContent(String(response.message ?? ""));
      if (!assistantContent) {
        throw new Error("Risposta vuota dal Coach AI.");
      }
      setProvider((response.provider as ChatProvider | undefined) ?? null);
      if (response.fallback && !fallbackToastShownRef.current) {
        toast.warning(
          "Coach in modalità base: risposte semplificate (controlla la configurazione del server per l'AI)."
        );
        fallbackToastShownRef.current = true;
      }
      if (!response.fallback) {
        fallbackToastShownRef.current = false;
      }
      setMessages(prev =>
        sanitizeChatMessages([...prev, { role: "assistant", content: assistantContent }])
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile contattare il Coach AI.";
      toast.error(message);
    }
  };

  const clear = () => {
    setMessages([]);
    setProvider(null);
    if (typeof window !== "undefined" && storageKeys) {
      window.localStorage.removeItem(storageKeys.history);
    }
  };

  return {
    messages,
    goal,
    setGoal,
    constraints,
    setConstraints,
    provider,
    send,
    clear,
    isPending: chatMutation.isPending,
  };
}
