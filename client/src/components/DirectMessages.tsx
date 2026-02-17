/**
 * Direct Messages Component - Chat tra membri
 */

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, Search, PenSquare } from "lucide-react";
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

interface DirectMessagesProps {
  recipientId?: number;
  recipientName?: string;
}

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
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

export default function DirectMessages({ recipientId, recipientName }: DirectMessagesProps) {
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
    { enabled: isOpen && !recipientId }
  );

  // Conversazione specifica — poll every 5s when open
  const conversationQuery = trpc.community.messages.conversation.useQuery(
    { otherUserId: selectedConversation || 0, limit: 50 },
    {
      enabled: !!selectedConversation,
      refetchInterval: isOpen && view === "conversation" ? 5_000 : false,
    }
  );

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
        {!conversationsQuery.data || conversationsQuery.data.length === 0 ? (
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
              {conversationsQuery.data.map((conv) => (
                <button
                  key={conv.lastMessage.id}
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
                        {conv.lastMessage.content}
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
                      <p className="text-sm whitespace-pre-wrap">{msg.message.content}</p>
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
