/**
 * Direct messages between swimmers, in three places:
 * - `mode="link"`: the header icon to /messages, with the unread count (and the Realtime
 *   subscription that refreshes every message query: the header is always mounted);
 * - `mode="page"`: the Messages page, conversations and the open chat side by side on desktop,
 *   one at a time on phones. The URL says what is open: `?con=<userId>` the chat, `?new=1`
 *   «Nuovo messaggio» (the person search), so back returns to the list and a link (a push
 *   notification, «Crea» → «Messaggio») opens the right view;
 * - a dialog with one swimmer (`recipientId`), opened from their public profile.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation, useSearch } from "wouter";
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
import { dmRetentionNote } from "@/lib/dm-retention";
import { formatDayMonth, formatSessionDate, getInitials } from "@/lib/format";
import { previousInAppPath } from "@/lib/in-app-history";
import { uniqueRealtimeTopic } from "@/lib/realtime-topic";
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

const MESSAGES_PATH = "/messages";

type MessagesView = { conId: number | null; composing: boolean };

/** `?con=<userId>` (a positive id, else nothing) and `?new=1`. */
function readMessagesView(search: string): MessagesView {
  const params = new URLSearchParams(search);
  const con = Number(params.get("con"));
  return { conId: Number.isInteger(con) && con > 0 ? con : null, composing: params.get("new") === "1" };
}

function messagesHref({ conId, composing }: MessagesView) {
  const params = new URLSearchParams();
  if (conId !== null) params.set("con", String(conId));
  if (composing) params.set("new", "1");
  const query = params.toString();
  return query ? `${MESSAGES_PATH}?${query}` : MESSAGES_PATH;
}

const RETENTION_NOTE = dmRetentionNote();
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

/** The conversation list's short date: «10:47» today, «27 ott» before; nothing for an invalid date. */
function listTime(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString() ? timeFmt.format(date) : formatDayMonth(date);
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
      .channel(uniqueRealtimeTopic(`dm:${currentUserId}`))
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

const subscribeToVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** Whether the page is on screen: false in a background tab or with the app in the background. */
function usePageVisible() {
  return useSyncExternalStore(subscribeToVisibility, () => document.visibilityState === "visible", () => true);
}

/**
 * One chat: the messages (polled every 5 s while shown), marked read as they arrive while the
 * page is on screen, and sending.
 */
function useConversation(otherUserId: number, { active, limit }: { active: boolean; limit: number }) {
  const utils = trpc.useUtils();
  const query = trpc.community.messages.conversation.useQuery(
    { otherUserId, limit },
    { enabled: active, refetchInterval: active ? 5_000 : false }
  );
  const pageVisible = usePageVisible();

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
  // The newest unread message a «read» was sent for: once per message, not on every poll. A
  // failure forgets it, so the next poll (`dataUpdatedAt`) tries again. `markRead` is left out
  // of the deps (a new object on every render).
  const markedId = useRef<number | null>(null);
  useEffect(() => {
    if (!active || !pageVisible || lastUnreadId === null || markedId.current === lastUnreadId) return;
    markedId.current = lastUnreadId;
    markRead.mutate(
      { senderId: otherUserId },
      {
        onError: () => {
          if (markedId.current === lastUnreadId) markedId.current = null;
        },
      }
    );
  }, [active, pageVisible, lastUnreadId, otherUserId, query.dataUpdatedAt]);

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
    body = <LoadError variant="inline" onRetry={() => void query.refetch()} className="p-4" />;
  } else if (messages.length === 0) {
    body = <p className="p-6 text-center text-sm text-muted-foreground">Nessun messaggio: scrivi il primo.</p>;
  } else {
    body = (
      // Focusable, so the keyboard can scroll it (arrows, Pag↑/Pag↓): it sits between the chat's
      // name and the message field in the tab order.
      <div
        role="log"
        aria-label={`Messaggi con ${partner.name}`}
        tabIndex={0}
        className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
      >
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
  const inputRef = useRef<HTMLInputElement>(null);
  const name = recipientName?.trim() || "Nuotatore";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageCircle aria-hidden />
          Messaggio
        </Button>
      </DialogTrigger>
      <DialogContent
        className="flex h-[600px] max-h-[80dvh] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        // The message field, not the first focusable (the message log once loaded): the dialog
        // was opened to write.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="border-b border-border p-4 pr-12 text-left">
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription className="text-xs">{RETENTION_NOTE}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          <ConversationView partner={{ id: recipientId, name }} active={open} limit={50} inputRef={inputRef} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MessagesPage() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [, navigate] = useLocation();
  const { conId, composing } = readMessagesView(useSearch());
  // The last person opened from the list or the search: their name until the list has them.
  const [picked, setPicked] = useState<Partner | null>(null);
  // The search text belongs to one view: it starts empty whenever «Nuovo messaggio» opens or closes.
  const [searchState, setSearchState] = useState({ composing, text: "" });
  const search = searchState.composing === composing ? searchState.text : "";
  const setSearch = (text: string) => setSearchState({ composing, text });
  const searchRef = useRef<HTMLInputElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const newButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const chatHeadingRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes after a view change that removes the focused control.
  const pendingFocus = useRef<"search" | "new" | "list" | "composer" | "chat" | null>(null);

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

  // Who `?con=` is: the conversation list, else the person just picked, else their profile.
  const listed = conId === null ? undefined : conversations.find((conv) => conv.otherUser.id === conId);
  const knownPick = picked !== null && picked.id === conId ? picked : null;
  const profileQuery = trpc.community.users.getPublicProfile.useQuery(
    { userId: conId ?? 0 },
    { enabled: conId !== null && !listed && !knownPick && !conversationsQuery.isPending }
  );
  let selected: Partner | null = null;
  if (conId !== null) {
    if (listed) {
      selected = {
        id: conId,
        name: listed.otherUser.username || "Utente",
        avatarUrl: listed.otherUser.profilePicture,
      };
    } else if (knownPick) {
      selected = knownPick;
    } else {
      const profile = (profileQuery.data ?? null) as Record<string, unknown> | null;
      const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
      selected = {
        id: conId,
        name: text(profile?.name) || text(profile?.username) || "Nuotatore",
        avatarUrl: text(profile?.avatarUrl) || null,
      };
    }
  }

  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const peopleQuery = trpc.community.users.search.useQuery(
    { query, limit: 10 },
    { enabled: composing && query.length >= 1 }
  );

  // Desktop shows the chat next to the list: the newest conversation opens by itself, in place
  // of the list's URL (no history entry of its own).
  const newestId = conversations[0]?.otherUser.id ?? null;
  useEffect(() => {
    if (!isDesktop || conId !== null || composing || newestId === null) return;
    navigate(messagesHref({ conId: newestId, composing: false }), { replace: true });
  }, [isDesktop, conId, composing, newestId, navigate]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const element = {
      search: searchRef.current,
      new: newButtonRef.current,
      list: listHeadingRef.current,
      composer: composerRef.current,
      chat: chatHeadingRef.current,
    }[target];
    element?.focus();
  }, [composing, conId, isDesktop]);

  /** To `target`: back in history when it is the previous entry, else in place of this one. */
  const leaveTo = (target: string) => {
    if (previousInAppPath() === target) window.history.back();
    else navigate(target, { replace: true });
  };

  const open = (partner: Partner) => {
    setPicked(partner);
    setSearch("");
    if (partner.id === conId && !composing) return;
    // Phones swap the list for the chat: focus goes to its name (the message field would pop up
    // the keyboard). On desktop a person picked in the search leaves the search for their chat:
    // the next step is writing; a row of the list stays where it is.
    if (!isDesktop) pendingFocus.current = "chat";
    else if (composing) pendingFocus.current = "composer";
    // A chat is a history entry (back returns to the list); one picked in «Nuovo messaggio»
    // takes the search's place, so back never reopens a search that was done.
    navigate(messagesHref({ conId: partner.id, composing: false }), { replace: composing });
  };
  const startComposing = () => {
    pendingFocus.current = "search";
    navigate(messagesHref({ conId, composing: true }));
  };
  const stopComposing = () => {
    pendingFocus.current = "new";
    leaveTo(messagesHref({ conId, composing: false }));
  };
  const backToList = () => {
    pendingFocus.current = "list";
    leaveTo(MESSAGES_PATH);
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
      list = <LoadError variant="inline" onRetry={() => void peopleQuery.refetch()} className="p-4" />;
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
    list = <LoadError variant="inline" onRetry={() => void conversationsQuery.refetch()} className="p-4" />;
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
                    <span className="shrink-0 text-xs text-muted-foreground">{listTime(conv.lastMessage.createdAt)}</span>
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
                  <h2 ref={chatHeadingRef} tabIndex={-1} className="min-w-0 truncate text-[17px] font-bold outline-none">
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
