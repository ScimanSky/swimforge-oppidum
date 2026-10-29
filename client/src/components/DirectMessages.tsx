/**
 * Direct messages between swimmers, in three places:
 * - `mode="link"`: the header icon to /messages, with the unread count (and the Realtime
 *   subscription that refreshes every message query: the header is always mounted);
 * - `mode="page"`: the Messages page, conversations and the open chat side by side on desktop,
 *   one at a time on phones;
 * - a dialog with one swimmer (`recipientId`), opened from their public profile.
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, MessageCircle, PenSquare, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatSessionDate, getInitials } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { cn } from "@/lib/utils";

type DirectMessagesProps =
  | { mode: "link" }
  | { mode: "page" }
  | { mode?: "dialog"; recipientId: number; recipientName?: string };

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

interface Conversation {
  lastMessage: Message;
  otherUser: {
    id: number;
    /** The server's display name: name, else username, else «Utente #id». */
    username: string | null;
    profilePicture: string | null;
  };
  unreadCount: number;
}

type Partner = { id: number; name: string; avatarUrl?: string | null };

type ForwardMetadata = {
  targetType?: "post";
  targetId?: number;
  ownerName?: string | null;
  previewText?: string | null;
  previewMediaUrl?: string | null;
};

const RETENTION_DAYS = (() => {
  const days = Number(import.meta.env.VITE_DM_RETENTION_DAYS ?? 60);
  return Number.isFinite(days) ? days : 60;
})();
const RETENTION_NOTE = `I messaggi vengono eliminati automaticamente dal server dopo ${RETENTION_DAYS} giorni.`;
const SEARCH_DEBOUNCE_MS = 250;

function parseForwardMetadata(raw: unknown): ForwardMetadata | null {
  const source =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as unknown;
          } catch {
            return null;
          }
        })()
      : raw;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const data = source as Record<string, unknown>;
  const targetType = data.targetType === "post" ? data.targetType : undefined;
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

function conversationPreview(message: Message) {
  if (message.messageType === "forward_post") return "Post inoltrato";
  return message.content;
}

const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" });

/** «10:47» today, «lun 27 ott · 10:47» before; nothing for an invalid date. */
function messageTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString() ? timeFmt.format(date) : formatSessionDate(date);
}

function MessageTime({ value }: { value: Date | string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <time dateTime={date.toISOString()}>{messageTime(date)}</time>;
}

/** «9+» above nine. */
const countLabel = (count: number) => (count > 9 ? "9+" : String(count));

const toCount = (value: unknown) => Math.max(0, Number(value) || 0);

export default function DirectMessages(props: DirectMessagesProps) {
  if (props.mode === "link") return <MessagesLink />;
  if (props.mode === "page") return <MessagesPage />;
  return <MessageDialog recipientId={props.recipientId} recipientName={props.recipientName} />;
}

/** Supabase Realtime: a new message for me refreshes the unread count, the list and the chats. */
function useMessagesRealtime() {
  const utils = trpc.useUtils();
  const profileQuery = trpc.profile.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const currentUserId = profileQuery.data?.userId;

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
          utils.community.messages.conversation.invalidate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, utils]);
}

function MessagesLink() {
  useMessagesRealtime();
  const unreadQuery = trpc.community.messages.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const unread = toCount(unreadQuery.data?.count);

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link href="/messages" aria-label={unread > 0 ? `Messaggi, ${unread} non letti` : "Messaggi"}>
        <MessageCircle className="size-5" aria-hidden />
        {unread > 0 ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums"
          >
            {countLabel(unread)}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

/** One chat: the messages (polled every 5 s while shown), marked read as they arrive, and sending. */
function useConversation(otherUserId: number, { active, limit }: { active: boolean; limit: number }) {
  const utils = trpc.useUtils();
  const query = trpc.community.messages.conversation.useQuery(
    { otherUserId, limit },
    { enabled: active, refetchInterval: active ? 5_000 : false }
  );

  const markRead = trpc.community.messages.markRead.useMutation({
    onSuccess: () => {
      utils.community.messages.recent.invalidate();
      utils.community.messages.unreadCount.invalidate();
    },
  });
  // The newest message from them still unread (my own unread ones are theirs to read).
  const lastUnreadId = useMemo(() => {
    const unread = (query.data ?? []).filter(
      (msg) => msg.message.senderId === otherUserId && !msg.message.isRead
    );
    return unread.length ? unread[unread.length - 1].message.id : null;
  }, [query.data, otherUserId]);
  // Once per newly arrived message (not on every poll): `markRead` is left out of the deps.
  useEffect(() => {
    if (lastUnreadId !== null) markRead.mutate({ senderId: otherUserId });
  }, [lastUnreadId, otherUserId]);

  const send = trpc.community.messages.send.useMutation({
    onSuccess: () => {
      utils.community.messages.conversation.invalidate();
      utils.community.messages.recent.invalidate();
      utils.community.messages.unreadCount.invalidate();
    },
    onError: (error) => toast.error(errorToastMessage(error, "Messaggio non inviato, riprova")),
  });

  return { query, send };
}

function MessageBubble({ message, own }: { message: Message; own: boolean }) {
  const forward = message.messageType === "forward_post" ? parseForwardMetadata(message.metadata) : null;
  return (
    <li className={cn("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 sm:max-w-[72%]",
          own ? "bg-primary text-primary-foreground" : "bg-raised text-foreground"
        )}
      >
        {/* Who wrote it, for screen readers (the side says it on screen). */}
        <span className="sr-only">{own ? "Tu: " : "Ricevuto: "}</span>
        {forward ? (
          <div className="space-y-2">
            {/* A card of its own: readable on both bubble colours. */}
            <div className="rounded-xl bg-card p-3 text-foreground">
              <p className="text-xs text-muted-foreground">Post inoltrato</p>
              <p className="text-sm font-semibold">{forward.ownerName || "Contenuto condiviso"}</p>
              {forward.previewMediaUrl ? (
                <img src={forward.previewMediaUrl} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />
              ) : null}
              {forward.previewText ? (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{forward.previewText}</p>
              ) : null}
              <Link
                href={`/post/${forward.targetId}`}
                className="mt-2 inline-block text-sm font-semibold text-action-text hover:underline"
              >
                Apri il post
              </Link>
            </div>
            {message.content ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : null}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        )}
        <p className="mt-1 text-xs">
          <MessageTime value={message.createdAt} />
        </p>
      </div>
    </li>
  );
}

function Composer({
  onSend,
  pending,
  inputRef,
}: {
  onSend: (content: string, sent: () => void) => void;
  pending: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const inputId = useId();
  const content = text.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!content || pending) return;
    onSend(content, () => setText(""));
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
      <label htmlFor={inputId} className="sr-only">
        Messaggio
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={5000}
        autoComplete="off"
        placeholder="Scrivi un messaggio…"
        className="flex-1"
      />
      <Button type="submit" disabled={!content || pending}>
        <Send aria-hidden />
        Invia
      </Button>
    </form>
  );
}

/** The messages with one swimmer and the composer; `header` sits above the messages. */
function ConversationView({
  partner,
  active,
  limit,
  header,
  inputRef,
}: {
  partner: Partner;
  active: boolean;
  limit: number;
  header?: ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { query, send } = useConversation(partner.id, { active, limit });
  const endRef = useRef<HTMLDivElement>(null);
  const messages = query.data ?? [];
  const lastId = messages.length ? messages[messages.length - 1].message.id : null;

  useEffect(() => {
    // `nearest`: brings the newest message into the chat's own scroll area, not the page.
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [lastId]);

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <LoadingSkeleton
        label="Caricamento dei messaggi…"
        count={3}
        className="space-y-3 p-4"
        itemClassName="h-12 w-2/3 rounded-2xl"
      />
    );
  } else if (query.isError && !query.data) {
    // A failed poll keeps the messages already on screen; only a chat that never loaded says so.
    body = <LoadError onRetry={() => void query.refetch()} className="m-4" />;
  } else if (messages.length === 0) {
    body = <p className="p-6 text-center text-sm text-muted-foreground">Nessun messaggio: scrivi il primo.</p>;
  } else {
    body = (
      <div role="log" aria-label={`Messaggi con ${partner.name}`}>
        <ul className="space-y-3 p-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.message.id} message={msg.message} own={msg.message.senderId !== partner.id} />
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full">{body}</ScrollArea>
      </div>
      <Composer
        key={partner.id}
        inputRef={inputRef}
        pending={send.isPending}
        onSend={(content, sent) =>
          send.mutate({ receiverId: partner.id, content }, { onSuccess: sent })
        }
      />
    </div>
  );
}

function PersonAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar aria-hidden className={cn("size-10 shrink-0 border border-border", className)}>
      <AvatarImage src={src || undefined} alt="" className="object-cover" />
      <AvatarFallback className="text-xs font-semibold">{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}

function MessageDialog({ recipientId, recipientName }: { recipientId: number; recipientName?: string }) {
  const [open, setOpen] = useState(false);
  const name = recipientName?.trim() || "Nuotatore";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageCircle aria-hidden />
          Messaggio
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[600px] max-h-[80dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 pr-12 text-left">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="text-xs">{RETENTION_NOTE}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <ConversationView partner={{ id: recipientId, name }} active={open} limit={50} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessagesPage() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [selected, setSelected] = useState<Partner | null>(null);
  const [composing, setComposing] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  // Where focus goes after a view change that removes the focused control.
  const pendingFocus = useRef<"search" | "new" | "list" | "composer" | null>(null);

  const conversationsQuery = trpc.community.messages.recent.useQuery(
    { limit: 20 },
    { refetchInterval: 8_000, refetchOnWindowFocus: true }
  );
  const conversations = useMemo<Conversation[]>(() => {
    // One row per person (newest message first), unread counts added up.
    const byUserId = new Map<number, Conversation>();
    for (const conv of conversationsQuery.data ?? []) {
      const existing = byUserId.get(conv.otherUser.id);
      const unreadCount = toCount(conv.unreadCount) + toCount(existing?.unreadCount);
      const newer =
        !existing ||
        new Date(conv.lastMessage.createdAt).getTime() >= new Date(existing.lastMessage.createdAt).getTime();
      byUserId.set(conv.otherUser.id, { ...(newer ? conv : existing), unreadCount });
    }
    return Array.from(byUserId.values()).sort(
      (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
    );
  }, [conversationsQuery.data]);

  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const peopleQuery = trpc.community.users.search.useQuery(
    { query, limit: 10 },
    { enabled: composing && query.length >= 1 }
  );

  // Desktop shows the chat next to the list: the newest conversation opens by itself.
  useEffect(() => {
    if (!isDesktop || selected || composing || conversations.length === 0) return;
    const first = conversations[0];
    setSelected({
      id: first.otherUser.id,
      name: first.otherUser.username || "Utente",
      avatarUrl: first.otherUser.profilePicture,
    });
  }, [isDesktop, selected, composing, conversations]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const element = {
      search: searchRef.current,
      new: newButtonRef.current,
      list: listHeadingRef.current,
      composer: composerRef.current,
    }[target];
    element?.focus();
  }, [composing, selected, isDesktop]);

  const open = (partner: Partner) => {
    setSelected(partner);
    setComposing(false);
    setSearch("");
    // On phones the list disappears: focus moves to the new message field.
    if (!isDesktop) pendingFocus.current = "composer";
  };
  const startComposing = () => {
    pendingFocus.current = "search";
    setSearch("");
    setComposing(true);
  };
  const stopComposing = () => {
    pendingFocus.current = "new";
    setSearch("");
    setComposing(false);
  };
  const backToList = () => {
    pendingFocus.current = "list";
    setSelected(null);
  };

  const filter = search.trim().toLowerCase();
  const visibleConversations = filter
    ? conversations.filter((conv) => (conv.otherUser.username ?? "").toLowerCase().includes(filter))
    : conversations;

  let list: ReactNode;
  if (composing) {
    if (query.length === 0) {
      list = <p className="p-4 text-sm text-muted-foreground">Scrivi un nome per cercare un nuotatore.</p>;
    } else if (peopleQuery.isPending) {
      list = <LoadingSkeleton label="Ricerca in corso…" count={3} className="space-y-2 p-4" itemClassName="h-14 w-full rounded-xl" />;
    } else if (peopleQuery.isError) {
      list = <LoadError onRetry={() => void peopleQuery.refetch()} className="m-4" />;
    } else if (peopleQuery.data.length === 0) {
      list = <p className="p-4 text-sm text-muted-foreground">Nessun nuotatore trovato.</p>;
    } else {
      list = (
        <ul className="divide-y divide-border">
          {peopleQuery.data.map((person) => {
            const name = person.name?.trim() || person.username?.trim() || "Nuotatore";
            const username = person.name?.trim() && person.username?.trim() ? `@${person.username.trim()}` : null;
            return (
              <li key={person.userId}>
                <button
                  type="button"
                  onClick={() => open({ id: person.userId, name, avatarUrl: person.avatarUrl })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                >
                  <PersonAvatar name={name} src={person.avatarUrl} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{name}</span>{" "}
                    {username ? <span className="block truncate text-xs text-muted-foreground">{username}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      );
    }
  } else if (conversationsQuery.isPending) {
    list = (
      <LoadingSkeleton label="Caricamento delle conversazioni…" count={4} className="space-y-2 p-4" itemClassName="h-14 w-full rounded-xl" />
    );
  } else if (conversationsQuery.isError && !conversationsQuery.data) {
    list = <LoadError onRetry={() => void conversationsQuery.refetch()} className="m-4" />;
  } else if (conversations.length === 0) {
    list = (
      <div className="flex flex-col items-center gap-3 p-6 text-center text-muted-foreground">
        <MessageCircle className="size-8" aria-hidden />
        <p className="text-sm">Nessun messaggio.</p>
        <Button variant="outline" onClick={startComposing}>
          <PenSquare aria-hidden />
          Scrivi un messaggio
        </Button>
      </div>
    );
  } else if (visibleConversations.length === 0) {
    list = <p className="p-4 text-sm text-muted-foreground">Nessuna conversazione trovata.</p>;
  } else {
    list = (
      <ul className="divide-y divide-border">
        {visibleConversations.map((conv) => {
          const name = conv.otherUser.username || "Utente";
          const isActive = selected?.id === conv.otherUser.id;
          return (
            <li key={conv.otherUser.id}>
              <button
                type="button"
                aria-current={isActive || undefined}
                onClick={() => open({ id: conv.otherUser.id, name, avatarUrl: conv.otherUser.profilePicture })}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised",
                  isActive && "bg-raised"
                )}
              >
                <PersonAvatar name={name} src={conv.otherUser.profilePicture} className="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{name}</span>{" "}
                    <span className="shrink-0 text-xs text-muted-foreground">{messageTime(conv.lastMessage.createdAt)}</span>
                  </span>{" "}
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-muted-foreground">{conversationPreview(conv.lastMessage)}</span>
                    {conv.unreadCount > 0 ? (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                        <span aria-hidden>{countLabel(conv.unreadCount)}</span>
                        <span className="sr-only">
                          , {conv.unreadCount} {conv.unreadCount === 1 ? "non letto" : "non letti"}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  const showChat = selected !== null;

  return (
    <section
      aria-label="Messaggi"
      className="surface-panel h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[420px] overflow-hidden p-0 lg:h-[calc(100dvh-7rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
    >
      <div className="grid h-full grid-rows-[minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cn("flex min-h-0 flex-col border-border lg:border-r", showChat && "hidden lg:flex")}>
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 ref={listHeadingRef} tabIndex={-1} className="text-[17px] font-bold outline-none">
                {composing ? "Nuovo messaggio" : "Conversazioni"}
              </h2>
              {composing ? (
                <Button variant="ghost" size="sm" onClick={stopComposing}>
                  Annulla
                </Button>
              ) : (
                <Button
                  ref={newButtonRef}
                  variant="ghost"
                  size="icon"
                  onClick={startComposing}
                  aria-label="Nuovo messaggio"
                  className="text-action-text"
                >
                  <PenSquare aria-hidden />
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label={composing ? "Cerca un nuotatore" : "Cerca tra le conversazioni"}
                placeholder={composing ? "Cerca un nuotatore…" : "Cerca tra le conversazioni…"}
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">{list}</ScrollArea>
          </div>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{RETENTION_NOTE}</p>
        </div>

        <div className={cn("min-h-0", !showChat && "hidden lg:block")}>
          {selected ? (
            <ConversationView
              key={selected.id}
              partner={selected}
              active
              limit={100}
              inputRef={composerRef}
              header={
                <div className="flex items-center gap-2 border-b border-border px-2 py-2 lg:px-4">
                  <Button variant="ghost" size="icon" onClick={backToList} aria-label="Torna alle conversazioni" className="lg:hidden">
                    <ChevronLeft className="size-5" aria-hidden />
                  </Button>
                  <PersonAvatar name={selected.name} src={selected.avatarUrl} />
                  <h2 className="min-w-0 truncate text-[17px] font-bold">
                    <Link href={`/u/${selected.id}`} className="hover:underline">
                      {selected.name}
                    </Link>
                  </h2>
                </div>
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
              <MessageCircle className="size-10" aria-hidden />
              <p className="text-sm">Scegli una conversazione o scrivi un nuovo messaggio.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
