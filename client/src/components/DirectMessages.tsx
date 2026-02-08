/**
 * Direct Messages Component - Chat tra membri
 */

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, X } from "lucide-react";
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
import { toast } from "sonner";

interface DirectMessagesProps {
  recipientId?: number;
  recipientName?: string;
}

export default function DirectMessages({ recipientId, recipientName }: DirectMessagesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<number | null>(
    recipientId || null
  );
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Lista conversazioni recenti
  const conversationsQuery = trpc.community.messages.recent.useQuery(
    { limit: 20 },
    { enabled: isOpen && !recipientId }
  );

  // Conversazione specifica
  const conversationQuery = trpc.community.messages.conversation.useQuery(
    { otherUserId: selectedConversation || 0, limit: 50 },
    { enabled: !!selectedConversation }
  );

  const sendMutation = trpc.community.messages.send.useMutation({
    onSuccess: () => {
      setMessageText("");
      utils.community.messages.conversation.invalidate();
      utils.community.messages.recent.invalidate();
      scrollToBottom();
    },
    onError: (error) => {
      toast.error(error.message || "Errore nell'invio del messaggio");
    },
  });

  const markReadMutation = trpc.community.messages.markRead.useMutation({
    onSuccess: () => {
      utils.community.messages.recent.invalidate();
    },
  });

  useEffect(() => {
    if (selectedConversation && conversationQuery.data) {
      // Segna come letti i messaggi non letti
      const hasUnread = conversationQuery.data.some((msg: any) => !msg.message.isRead);
      if (hasUnread) {
        markReadMutation.mutate({ senderId: selectedConversation });
      }
      scrollToBottom();
    }
  }, [selectedConversation, conversationQuery.data]);

  useEffect(() => {
    if (recipientId) {
      setSelectedConversation(recipientId);
      setIsOpen(true);
    }
  }, [recipientId]);

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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getUnreadCount = () => {
    if (!conversationsQuery.data) return 0;
    return conversationsQuery.data.reduce((acc: number, conv: any) => acc + (conv.unreadCount || 0), 0);
  };

  const renderConversationsList = () => {
    if (!conversationsQuery.data || conversationsQuery.data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <MessageCircle className="h-12 w-12 mb-2" />
          <p className="text-sm">Nessun messaggio</p>
        </div>
      );
    }

    return (
      <div className="divide-y">
        {conversationsQuery.data.map((conv: any) => (
          <button
            key={conv.lastMessage.id}
            onClick={() => setSelectedConversation(conv.otherUser.id)}
            className={`w-full text-left p-4 hover:bg-accent transition-colors ${
              selectedConversation === conv.otherUser.id ? "bg-accent" : ""
            }`}
          >
            <div className="flex gap-3">
              <Avatar className="h-10 w-10 flex-shrink-0">
                <AvatarImage src={conv.otherUser.profilePicture || undefined} />
                <AvatarFallback>
                  {conv.otherUser.username?.[0]?.toUpperCase() || "U"}
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

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-4 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedConversation(null)}
          >
            ← Indietro
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <Avatar className="h-8 w-8">
              <AvatarImage src={conversationQuery.data[0]?.sender?.profilePicture || undefined} />
              <AvatarFallback>U</AvatarFallback>
            </Avatar>
            <span className="font-semibold">
              {recipientName || conversationQuery.data[0]?.sender?.username || "Utente"}
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {conversationQuery.data.map((msg: any) => {
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

        <div className="p-4 border-t">
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <MessageCircle className="h-5 w-5" />
          {!recipientId && getUnreadCount() > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {getUnreadCount() > 9 ? "9+" : getUnreadCount()}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>Messaggi</DialogTitle>
        </DialogHeader>
        {selectedConversation ? renderConversation() : renderConversationsList()}
      </DialogContent>
    </Dialog>
  );
}
