/**
 * Notification bell in the shell header: unread count (Realtime plus a 30 s poll), the latest 20
 * notifications in a popover, «Segna tutte come lette», and a tap opens what it is about.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AtSign,
  Award,
  Bell,
  CalendarDays,
  Droplet,
  Heart,
  Mail,
  MessageCircle,
  Shield,
  Trophy,
  UserPlus,
  Users,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadError, LoadingSkeleton } from "@/components/corsia/LoadState";
import { formatTimeAgo } from "@/lib/format";
import { toInAppPath } from "@/lib/navigation";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const LIST_INPUT = { limit: 20, onlyUnread: false } as const;

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

const ICONS: Record<string, LucideIcon> = {
  post_like: Droplet,
  splash: Droplet,
  reaction: Heart,
  comment: MessageCircle,
  mention: AtSign,
  follow: UserPlus,
  event_invite: CalendarDays,
  dm: Mail,
  badge_earned: Award,
  club_invite: Users,
  activity_shared: Waves,
  meet_published: Trophy,
  report_update: Shield,
};

/** «9+» above nine. */
const countLabel = (count: number) => (count > 9 ? "9+" : String(count));

/** Where a notification leads: its own in-app link, else a page that fits its type. */
function notificationPath(notification: any): string {
  // In-app paths only: another site's address cannot be pushed to the history.
  const link = toInAppPath(typeof notification.link === "string" ? notification.link : null);
  if (link) return link;
  const referenceId = Number(notification.referenceId ?? notification.reference_id);
  switch (notification.type) {
    case "mention":
    case "reaction":
    case "splash":
    case "comment":
    case "activity_shared":
      return Number.isFinite(referenceId) && referenceId > 0 ? `/post/${referenceId}` : "/home";
    case "follow":
      return "/home/community";
    default:
      return "/home";
  }
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [, navigate] = useLocation();
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
    refetchInterval: 30000, // Polling fallback ogni 30s (Realtime è primario)
    enabled: inAppEnabled,
  });

  const notificationsQuery = trpc.community.notifications.list.useQuery(
    LIST_INPUT,
    { enabled: isOpen && inAppEnabled }
  );

  const markReadMutation = trpc.community.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.community.notifications.unreadCount.invalidate();
      utils.community.notifications.list.invalidate();
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Impossibile segnare le notifiche come lette"));
      utils.community.notifications.unreadCount.invalidate();
      utils.community.notifications.list.invalidate();
    },
  });

  // Supabase Realtime: invalidate on new notification INSERT
  const currentUserId = profileQuery.data?.userId;
  useEffect(() => {
    if (!currentUserId || !inAppEnabled) return;

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => {
          utils.community.notifications.unreadCount.invalidate();
          utils.community.notifications.list.invalidate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, inAppEnabled, utils]);

  const unreadCount = Math.max(0, Number(unreadCountQuery.data?.count) || 0);

  if (!inAppEnabled) {
    return null;
  }

  const handleMarkAllRead = () => {
    markReadMutation.mutate(
      {},
      { onSuccess: () => toast.success("Tutte le notifiche segnate come lette") }
    );
  };

  const handleNotificationClick = (notification: any) => {
    const notificationId = Number(notification.id);
    const hasValidNotificationId = Number.isInteger(notificationId) && notificationId > 0;

    if (!notification.isRead) {
      // Optimistically decrement unread count
      utils.community.notifications.unreadCount.setData(undefined, (old) =>
        old ? { count: Math.max(0, old.count - 1) } : old
      );
      // Mark the item read in the cached list
      utils.community.notifications.list.setData(LIST_INPUT, (old) =>
        old?.map((n: any) => Number(n.id) === notificationId ? { ...n, isRead: true } : n)
      );
      if (hasValidNotificationId) {
        markReadMutation.mutate({ notificationIds: [notificationId] });
      } else {
        utils.community.notifications.unreadCount.invalidate();
        utils.community.notifications.list.invalidate();
      }
    }
    setIsOpen(false);
    navigate(notificationPath(notification));
  };

  const notifications = (notificationsQuery.data ?? []) as any[];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums"
            >
              {countLabel(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <h2 className="text-[17px] font-bold">Notifiche</h2>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markReadMutation.isPending}
              className="text-action-text"
            >
              Segna tutte come lette
            </Button>
          )}
        </div>
        <ScrollArea className="h-[min(400px,60dvh)]">
          {notificationsQuery.isPending ? (
            <LoadingSkeleton label="Caricamento delle notifiche…" count={4} className="space-y-2 p-4" />
          ) : notificationsQuery.isError ? (
            <LoadError onRetry={() => void notificationsQuery.refetch()} className="m-4" />
          ) : notifications.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <Bell className="mb-2 size-8" aria-hidden />
              <p className="text-sm">Nessuna notifica</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const Icon = ICONS[String(notification.type)] ?? Bell;
                const unread = !notification.isRead;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "flex w-full gap-3 p-4 text-left transition-colors hover:bg-raised",
                        unread && "bg-primary/10"
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full bg-raised",
                          unread ? "text-action-text" : "text-muted-foreground"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        {/* Spaces between the blocks keep the button's name readable. */}
                        <span className="mb-1 block text-sm font-semibold">{notification.title}</span>{" "}
                        <span className="line-clamp-2 block text-sm text-muted-foreground">
                          {notification.message}
                        </span>{" "}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {formatTimeAgo(notification.createdAt)}
                          {unread ? <span className="sr-only">, non letta</span> : null}
                        </span>
                      </span>
                      {unread ? <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
