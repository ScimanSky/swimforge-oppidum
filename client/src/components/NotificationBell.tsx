/**
 * Notification Bell Component - Sistema notifiche real-time
 */

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const utils = trpc.useUtils();

  const profileQuery = trpc.profile.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const inAppEnabled = (() => {
    const raw = (profileQuery.data?.notificationSettings as Record<string, unknown> | null | undefined)
      ?.in_app_notifications;
    return coerceBoolean(raw) ?? true;
  })();

  const unreadCountQuery = trpc.community.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60000, // Poll ogni 60 secondi (ridotto carico server)
    enabled: inAppEnabled,
  });

  const notificationsQuery = trpc.community.notifications.list.useQuery(
    { limit: 20, onlyUnread: false },
    { enabled: isOpen && inAppEnabled }
  );

  const markReadMutation = trpc.community.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.community.notifications.unreadCount.invalidate();
      utils.community.notifications.list.invalidate();
    },
  });

  const unreadCount = unreadCountQuery.data?.count || 0;

  if (!inAppEnabled) {
    return null;
  }

  const handleMarkAllRead = () => {
    markReadMutation.mutate({});
    toast.success("Tutte le notifiche segnate come lette");
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markReadMutation.mutate({ notificationIds: [notification.id] });
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
    setIsOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    // Restituisce emoji in base al tipo
    switch (type) {
      case "post_like":
      case "splash":
        return "💧";
      case "comment":
        return "💬";
      case "follow":
        return "👥";
      case "event_invite":
        return "📅";
      case "dm":
        return "✉️";
      case "badge_earned":
        return "🏅";
      case "club_invite":
        return "🏊";
      default:
        return "🔔";
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    
    if (diffMinutes < 1) return "adesso";
    if (diffMinutes < 60) return `${diffMinutes} min fa`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h fa`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}g fa`;
    return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifiche</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs"
            >
              Segna tutte come lette
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notificationsQuery.isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : !notificationsQuery.data || notificationsQuery.data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2" />
              <p className="text-sm">Nessuna notifica</p>
            </div>
          ) : (
            <div className="divide-y">
              {notificationsQuery.data.map((notification: any) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full text-left p-4 hover:bg-accent transition-colors ${
                    !notification.isRead ? "bg-accent/50" : ""
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="text-2xl flex-shrink-0">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm mb-1">{notification.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatTimeAgo(notification.createdAt)}
                      </p>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
