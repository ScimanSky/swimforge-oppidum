import { create } from "zustand";

export interface BadgeNotificationItem {
  id: number | string;
  code: string;
  name: string;
  description: string;
  image_url: string;
  rarity?: string;
  category?: "classic" | "achievement" | "season";
}

interface BadgeNotificationStore {
  pendingBadges: BadgeNotificationItem[];
  isShowing: boolean;
  addBadges: (badges: BadgeNotificationItem[]) => void;
  clearBadges: () => void;
  setShowing: (showing: boolean) => void;
}

const getBadgeKey = (badge: BadgeNotificationItem) => `${badge.code}:${badge.id}`;

export const useBadgeNotifications = create<BadgeNotificationStore>((set) => ({
  pendingBadges: [],
  isShowing: false,
  addBadges: (badges) =>
    set((state) => {
      if (!badges.length) return state;
      const existing = new Set(state.pendingBadges.map(getBadgeKey));
      const uniqueIncoming = badges.filter((badge) => !existing.has(getBadgeKey(badge)));
      if (!uniqueIncoming.length) return state;
      return {
        pendingBadges: [...state.pendingBadges, ...uniqueIncoming],
        isShowing: true,
      };
    }),
  clearBadges: () => set({ pendingBadges: [], isShowing: false }),
  setShowing: (showing) => set({ isShowing: showing }),
}));
