/**
 * Direct Messages Component - Chat tra membri
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { MessageCircle, Send, Search, PenSquare, Phone, Video, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DirectMessagesProps {
  recipientId?: number;
  recipientName?: string;
  mode?: "dialog" | "page" | "link";
}

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  messageType?: string | null;
  metadata?: unknown;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

interface MessageWithSender {
  message: Message;
  sender: {
    id: number;
    username: string | null;
    profilePicture: string | null;
  };
}

interface Conversation {
  lastMessage: Message;
  otherUser: {
    id: number;
    username: string | null;
    profilePicture: string | null;
  };
  unreadCount: number;
}

type View = "list" | "conversation" | "search";

type ForwardMetadata = {
  targetType?: "post" | "story";
  targetId?: number;
  ownerName?: string | null;
  previewText?: string | null;
  previewMediaUrl?: string | null;
};

function parseForwardMetadata(raw: unknown): ForwardMetadata | null {
  const source =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown
          } catch {
            return null
          }
        })()
      : raw
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const data = source as Record<string, unknown>;
  const targetType = data.targetType === "post" || data.targetType === "story" ? data.targetType : undefined;
  const targetId = typeof data.targetId === "number" ? data.targetId : Number(data.targetId);
  const ownerName = typeof data.ownerName === "string" ? data.ownerName : null;
  const previewText = typeof data.previewText === "string" ? data.previewText : null;
  const previewMediaUrl = typeof data.previewMediaUrl === "string" ? data.previewMediaUrl : null;
  if (!targetType || !Number.isFinite(targetId) || targetId <= 0) return null;
  return {
    targetType,
    targetId: Math.trunc(targetId),
    ownerName,
    previewText,
    previewMediaUrl,
  };
}

function getConversationPreview(message: Message) {
  if (message.messageType === "forward_post") return "📩 Post inoltrato"
  if (message.messageType === "forward_story") return "📩 Story inoltrata"
  return message.content
}

export default function DirectMessages({ recipientId, recipientName, mode = "dialog" }: DirectMessagesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>(recipientId ? "conversation" : "list");
  const [selectedConversation, setSelectedConversation] = useState<number | null>(
    recipientId || null
  );
  const [selectedName, setSelectedName] = useState<string | null>(recipientName || null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const isPageMode = mode === "page";
  const isLinkMode = mode === "link";
  const panelActive = isPageMode ? true : isOpen;
  const conversationLimit = isPageMode ? 100 : 50;

  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const currentUserId = profileQuery.data?.userId;
  const dmRetentionDays = Number(import.meta.env.VITE_DM_RETENTION_DAYS ?? 60);

  // Unread DM count — always active (shows badge on icon)
  const unreadDmQuery = trpc.community.messages.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  // Lista conversazioni recenti
  const conversationsQuery = trpc.community.messages.recent.useQuery(
    { limit: 20 },
    {
      enabled: panelActive && !recipientId,
      refetchInterval: isPageMode ? 8_000 : false,
      refetchOnWindowFocus: true,
    }
  );

  // Conversazione specifica — poll every 5s when open
  const conversationQuery = trpc.community.messages.conversation.useQuery(
    { otherUserId: selectedConversation || 0, limit: conversationLimit },
    {
      enabled: !!selectedConversation && (isPageMode || isOpen || !!recipientId),
      refetchInterval: panelActive && view === "conversation" ? 5_000 : false,
    }
  );

  const normalizedConversations = useMemo<Conversation[]>(() => {
    const source = conversationsQuery.data ?? [];
    const byUserId = new Map<number, Conversation>();

    source.forEach((conv) => {
      const key = conv.otherUser.id;
      const existing = byUserId.get(key);
      if (!existing) {
        byUserId.set(key, { ...conv, unreadCount: Math.max(0, Number(conv.unreadCount ?? 0)) });
        return;
      }

      const currentCreatedAt = new Date(conv.lastMessage.createdAt).getTime();
      const existingCreatedAt = new Date(existing.lastMessage.createdAt).getTime();
      const mergedUnread = Math.max(0, Number(existing.unreadCount ?? 0)) + Math.max(0, Number(conv.unreadCount ?? 0));

      if (currentCreatedAt >= existingCreatedAt) {
        byUserId.set(key, { ...conv, unreadCount: mergedUnread });
      } else {
        byUserId.set(key, { ...existing, unreadCount: mergedUnread });
      }
    });

    return Array.from(byUserId.values()).sort(
      (a, b) =>
        new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    );
  }, [conversationsQuery.data]);

  // User search
  const userSearchQuery = trpc.community.users.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: view === "search" && searchQuery.length >= 1 }
  );

  const sendMutation = trpc.community.messages.send.useMutation({
    onSuccess: () => {
      setMessageText("");
      utils.community.messages.conversation.invalidate();
      utils.community.messages.recent.invalidate();
      utils.community.messages.unreadCount.invalidate();
      scrollToBottom();
    },
    onError: (error) => {
      toast.error(error.message || "Errore nell'invio del messaggio");
    },
  });

  const markReadMutation = trpc.community.messages.markRead.useMutation({
    onSuccess: () => {
      utils.community.messages.recent.invalidate();
      utils.community.messages.unreadCount.invalidate();
    },
  });

  // Supabase Realtime: refresh on new DM
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`dm:${currentUserId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "direct_messages",
          filter: `receiver_id=eq.${currentUserId}`,
        },
        () => {
          utils.community.messages.unreadCount.invalidate();
          utils.community.messages.recent.invalidate();
          if (selectedConversation) {
            utils.community.messages.conversation.invalidate();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, selectedConversation, utils]);

  useEffect(() => {
    if (selectedConversation && conversationQuery.data) {
      const hasUnread = conversationQuery.data.some((msg) => !msg.message.isRead);
      if (hasUnread) {
        markReadMutation.mutate({ senderId: selectedConversation });
      }
      scrollToBottom();
    }
  }, [selectedConversation, conversationQuery.data]);

  useEffect(() => {
    if (recipientId) {
      setSelectedConversation(recipientId);
      setSelectedName(recipientName || null);
      setView("conversation");
    }
  }, [recipientId]);

  useEffect(() => {
    if (view === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [view]);

  useEffect(() => {
    if (!isPageMode || recipientId) return;
    if (!selectedConversation && normalizedConversations.length) {
      const first = normalizedConversations[0];
      setSelectedConversation(first.otherUser.id);
      setSelectedName(first.otherUser.username);
      setView("conversation");
    }
  }, [isPageMode, recipientId, selectedConversation, normalizedConversations]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = () => {
    if (!messageText.trim() || !selectedConversation) return;

    sendMutation.mutate({
      receiverId: selectedConversation,
      content: messageText.trim(),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openConversation = (userId: number, name: string | null) => {
    setSelectedConversation(userId);
    setSelectedName(name);
    setView("conversation");
    setSearchQuery("");
  };

  const formatTime = (dateInput: string | Date) => {
    const date = new Date(dateInput);
    return date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const unreadCount = unreadDmQuery.data?.count ?? 0;

  const renderSearchView = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-4 border-b shrink-0">
        <Button variant="ghost" size="sm" onClick={() => { setView("list"); setSearchQuery(""); }}>
          ← Indietro
        </Button>
        <span className="font-semibold text-sm">Nuovo messaggio</span>
      </div>
      <div className="px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca utente per nome..."
            className="pl-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {searchQuery.length < 1 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Search className="size-8 mb-2 opacity-50" />
            <p className="text-sm">Cerca un utente per iniziare</p>
          </div>
        ) : userSearchQuery.isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : !userSearchQuery.data?.length ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <p className="text-sm">Nessun utente trovato</p>
          </div>
        ) : (
          <div className="divide-y">
            {userSearchQuery.data.map((user) => {
              const name = user.username || user.name || `#${user.userId}`;
              return (
                <button
                  key={user.userId}
                  onClick={() => openConversation(user.userId, name)}
                  className="w-full text-left p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage src={user.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs font-semibold">
                        {getInitials(name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{name}</p>
                      {user.level != null && (
                        <p className="text-xs text-muted-foreground">Lv.{user.level}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const renderConversationsList = () => {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <span className="text-xs text-muted-foreground">Conversazioni recenti</span>
          <Button
            variant="ghost-neon"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setView("search")}
          >
            <PenSquare className="size-3.5" />
            Nuovo
          </Button>
        </div>
        {!normalizedConversations.length ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-2" />
            <p className="text-sm">Nessun messaggio</p>
            <Button
              variant="outline-neon"
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setView("search")}
            >
              <PenSquare className="size-3.5" />
              Scrivi un messaggio
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {normalizedConversations.map((conv) => (
                <button
                  key={conv.otherUser.id}
                  onClick={() => openConversation(conv.otherUser.id, conv.otherUser.username)}
                  className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                    selectedConversation === conv.otherUser.id ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={conv.otherUser.profilePicture || undefined} />
                      <AvatarFallback>
                        {getInitials(conv.otherUser.username || "U")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold truncate">{conv.otherUser.username}</p>
                        {conv.unreadCount > 0 && (
                          <Badge variant="destructive" className="ml-2">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {getConversationPreview(conv.lastMessage)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTime(conv.lastMessage.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  };

  const renderConversation = () => {
    if (conversationQuery.error) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Impossibile caricare la conversazione. Riprova tra pochi secondi.
        </div>
      );
    }

    if (!conversationQuery.data) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    // Determine recipient name from props, state, or conversation data
    const otherUserName =
      selectedName ||
      recipientName ||
      conversationQuery.data[0]?.sender?.username ||
      "Utente";

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-3 p-4 border-b shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedConversation(null); setSelectedName(null); setView("list"); }}
          >
            ← Indietro
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <Avatar className="h-8 w-8">
              <AvatarImage src={conversationQuery.data[0]?.sender?.profilePicture || undefined} />
              <AvatarFallback className="text-xs">{getInitials(otherUserName)}</AvatarFallback>
            </Avatar>
            <span className="font-semibold">{otherUserName}</span>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              {conversationQuery.data.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <p className="text-sm">Inizia la conversazione!</p>
                </div>
              )}
              {conversationQuery.data.map((msg) => {
                const isOwn = msg.message.senderId !== selectedConversation;
                const forwardMeta = parseForwardMetadata(msg.message.metadata);
                const isForwarded =
                  (msg.message.messageType === "forward_post" || msg.message.messageType === "forward_story") &&
                  !!forwardMeta;
                return (
                  <div
                    key={msg.message.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        isOwn
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {isForwarded && forwardMeta ? (
                        <div className="space-y-2">
                          <div className="rounded-md border border-border/60 bg-background/60 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              {forwardMeta.targetType === "post" ? "Post inoltrato" : "Story inoltrata"}
                            </p>
                            <p className="text-sm font-medium">
                              {forwardMeta.ownerName
                                ? `${forwardMeta.ownerName}`
                                : "Contenuto condiviso"}
                            </p>
                            {forwardMeta.previewMediaUrl ? (
                              <img
                                src={forwardMeta.previewMediaUrl}
                                alt="Anteprima inoltro"
                                className="mt-2 h-24 w-full rounded-md object-cover"
                              />
                            ) : null}
                            {forwardMeta.previewText ? (
                              <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                                {forwardMeta.previewText}
                              </p>
                            ) : null}
                            <div className="mt-2">
                              {forwardMeta.targetType === "post" ? (
                                <Link
                                  href={`/post/${forwardMeta.targetId}`}
                                  className="text-xs font-medium text-[var(--electric-cyan)] hover:underline"
                                >
                                  Apri post
                                </Link>
                              ) : (
                                <Link
                                  href="/home"
                                  className="text-xs font-medium text-[var(--electric-cyan)] hover:underline"
                                >
                                  Apri feed
                                </Link>
                              )}
                            </div>
                          </div>
                          {msg.message.content ? (
                            <p className="text-sm whitespace-pre-wrap">{msg.message.content}</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.message.content}</p>
                      )}
                      <p className={`text-xs mt-1 ${isOwn ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {formatTime(msg.message.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        <div className="p-4 border-t shrink-0">
          <div className="flex gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Scrivi un messaggio..."
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderConversationMessages = (isPageLayout: boolean) => {
    if (conversationQuery.error) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
          Impossibile caricare i messaggi della chat.
        </div>
      );
    }

    if (!conversationQuery.data) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      );
    }

    return (
      <ScrollArea className="h-full">
        <div className={cn("space-y-4", isPageLayout ? "p-5 md:p-6" : "p-4")}>
          {conversationQuery.data.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">Inizia la conversazione!</p>
            </div>
          )}
          {conversationQuery.data.map((msg) => {
            const isOwn = msg.message.senderId !== selectedConversation;
            const forwardMeta = parseForwardMetadata(msg.message.metadata);
            const isForwarded =
              (msg.message.messageType === "forward_post" || msg.message.messageType === "forward_story") &&
              !!forwardMeta;
            return (
              <div
                key={msg.message.id}
                className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={cn(
                    "max-w-[72%] rounded-2xl px-4 py-2.5",
                    isOwn
                      ? "bg-[linear-gradient(135deg,color-mix(in_oklch,var(--electric-cyan)_28%,transparent),color-mix(in_oklch,var(--electric-lime)_16%,transparent))] text-foreground border border-[var(--electric-cyan)]/35"
                      : "bg-card/80 border border-border/60",
                  )}
                >
                  {isForwarded && forwardMeta ? (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-border/60 bg-background/60 p-2.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {forwardMeta.targetType === "post" ? "Post inoltrato" : "Story inoltrata"}
                        </p>
                        <p className="text-sm font-medium">
                          {forwardMeta.ownerName
                            ? `${forwardMeta.ownerName}`
                            : "Contenuto condiviso"}
                        </p>
                        {forwardMeta.previewMediaUrl ? (
                          <img
                            src={forwardMeta.previewMediaUrl}
                            alt="Anteprima inoltro"
                            className="mt-2 h-24 w-full rounded-md object-cover"
                          />
                        ) : null}
                        {forwardMeta.previewText ? (
                          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                            {forwardMeta.previewText}
                          </p>
                        ) : null}
                        <div className="mt-2">
                          {forwardMeta.targetType === "post" ? (
                            <Link
                              href={`/post/${forwardMeta.targetId}`}
                              className="text-xs font-medium text-[var(--electric-cyan)] hover:underline"
                            >
                              Apri post
                            </Link>
                          ) : (
                            <Link
                              href="/home"
                              className="text-xs font-medium text-[var(--electric-cyan)] hover:underline"
                            >
                              Apri feed
                            </Link>
                          )}
                        </div>
                      </div>
                      {msg.message.content ? (
                        <p className="text-sm whitespace-pre-wrap">{msg.message.content}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.message.content}</p>
                  )}
                  <p className={cn("text-xs mt-1", isOwn ? "text-foreground/70" : "text-muted-foreground")}>
                    {formatTime(msg.message.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    );
  };

  const renderPageList = () => {
    const tabBase =
      "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border border-transparent";

    return (
      <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card/35">
        <div className="border-b border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-display font-bold text-foreground">Messaggi</h2>
            <Button
              variant="ghost-neon"
              size="icon"
              className="size-9"
              onClick={() => setView("search")}
              aria-label="Nuovo messaggio"
            >
              <PenSquare className="size-4" />
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className={cn(tabBase, "bg-background/70 border-border/70 text-foreground")}>
              Primary
            </button>
            <button type="button" className={cn(tabBase, "text-muted-foreground hover:text-foreground")}>
              General
            </button>
            <button type="button" className={cn(tabBase, "text-muted-foreground hover:text-foreground")}>
              Richieste
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca messaggi..."
              className="h-10 rounded-xl border-border/70 bg-background/55 pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {view === "search" && searchQuery.length >= 1 ? (
            <div className="divide-y divide-border/40">
              {userSearchQuery.isLoading ? (
                <div className="flex items-center justify-center h-28">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : !userSearchQuery.data?.length ? (
                <div className="p-5 text-sm text-muted-foreground">Nessun utente trovato.</div>
              ) : (
                userSearchQuery.data.map((user) => {
                  const name = user.username || user.name || `#${user.userId}`;
                  return (
                    <button
                      key={user.userId}
                      onClick={() => openConversation(user.userId, name)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-background/65"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-10 border border-border/60">
                          <AvatarImage src={user.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">Inizia una nuova chat</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : conversationsQuery.error ? (
            <div className="flex h-40 flex-col items-center justify-center px-4 text-center text-muted-foreground">
              <MessageCircle className="size-8 opacity-60" />
              <p className="mt-2 text-sm">Errore caricamento conversazioni.</p>
            </div>
          ) : !normalizedConversations.length ? (
            <div className="flex h-40 flex-col items-center justify-center px-4 text-center text-muted-foreground">
              <MessageCircle className="size-8 opacity-60" />
              <p className="mt-2 text-sm">Nessun messaggio disponibile.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {normalizedConversations
                .filter((conv) => {
                  if (!searchQuery.trim()) return true;
                  const name = conv.otherUser.username ?? "";
                  return name.toLowerCase().includes(searchQuery.trim().toLowerCase());
                })
                .map((conv) => {
                  const isActive = selectedConversation === conv.otherUser.id;
                  return (
                    <button
                      key={conv.otherUser.id}
                      onClick={() => openConversation(conv.otherUser.id, conv.otherUser.username)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors hover:bg-background/65",
                        isActive && "bg-[linear-gradient(90deg,color-mix(in_oklch,var(--electric-cyan)_14%,transparent),transparent)]",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="size-11 border border-border/60">
                          <AvatarImage src={conv.otherUser.profilePicture || undefined} />
                          <AvatarFallback>{getInitials(conv.otherUser.username || "U")}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{conv.otherUser.username}</p>
                            <span className="text-[11px] text-muted-foreground">
                              {formatTime(conv.lastMessage.createdAt)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-muted-foreground">
                              {getConversationPreview(conv.lastMessage)}
                            </p>
                            {conv.unreadCount > 0 ? (
                              <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]" variant="destructive">
                                {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </ScrollArea>
      </div>
    );
  };

  const renderPageConversation = () => {
    if (!selectedConversation) {
      return (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageCircle className="mx-auto size-10 opacity-50" />
            <p className="mt-2 text-sm">Seleziona una conversazione per iniziare.</p>
          </div>
        </div>
      );
    }

    const otherUserName =
      selectedName ||
      recipientName ||
      normalizedConversations.find((conv) => conv.otherUser.id === selectedConversation)?.otherUser.username ||
      conversationQuery.data?.find((msg) => msg.sender.id === selectedConversation)?.sender.username ||
      "Utente";

    const otherAvatar =
      normalizedConversations.find((conv) => conv.otherUser.id === selectedConversation)?.otherUser.profilePicture ||
      conversationQuery.data?.find((msg) => msg.sender.id === selectedConversation)?.sender.profilePicture ||
      undefined;

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 md:px-5">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-10 border border-border/60">
              <AvatarImage src={otherAvatar} />
              <AvatarFallback className="text-xs">{getInitials(otherUserName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{otherUserName}</p>
              <p className="text-xs text-muted-foreground">Conversazione privata</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="Chiama">
              <Phone className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="Videochiamata">
              <Video className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" aria-label="Info">
              <Info className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0">{renderConversationMessages(true)}</div>

        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-2">
            <Input
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Scrivi un messaggio..."
              className="h-11 rounded-xl border-border/70 bg-background/55"
            />
            <Button
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
              className="h-11 rounded-xl px-4"
            >
              <Send className="mr-1 size-4" />
              Invia
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (isLinkMode) {
    return (
      <Link href="/messages" className="inline-flex">
        <Button variant="ghost" size="icon" className="relative min-h-[44px] min-w-[44px]">
          <MessageCircle className="h-5 w-5" />
          {!recipientId && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </Link>
    );
  }

  if (isPageMode) {
    return (
      <section className="surface-panel overflow-hidden h-[calc(100dvh-178px)] min-h-[620px]">
        <div className="grid h-full grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
          {renderPageList()}
          {renderPageConversation()}
        </div>
      </section>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        setView(recipientId ? "conversation" : "list");
        setSearchQuery("");
        if (!recipientId) {
          setSelectedConversation(null);
          setSelectedName(null);
        }
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <MessageCircle className="h-5 w-5" />
          {!recipientId && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[600px] max-h-[80dvh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Messaggi</DialogTitle>
          <p className="text-xs text-muted-foreground">
            I messaggi vengono eliminati automaticamente dal server dopo {Number.isFinite(dmRetentionDays) ? dmRetentionDays : 60} giorni.
          </p>
        </DialogHeader>
        {view === "search"
          ? renderSearchView()
          : view === "conversation" && selectedConversation
            ? renderConversation()
            : renderConversationsList()}
      </DialogContent>
    </Dialog>
  );
}
