import { create } from "zustand";

interface Badge {
  id: number;
  code: string;
  name: string;
  description: string;
  image_url: string;
}

interface BadgeNotificationStore {
  pendingBadges: Badge[];
  isShowing: boolean;
  addBadges: (badges: Badge[]) => void;
  clearBadges: () => void;
  setShowing: (showing: boolean) => void;
}

export const useBadgeNotifications = create<BadgeNotificationStore>((set) => ({
  pendingBadges: [],
  isShowing: false,
  addBadges: (badges) => set((state) => ({
    pendingBadges: [...state.pendingBadges, ...badges],
    isShowing: true,
  })),
  clearBadges: () => set({ pendingBadges: [], isShowing: false }),
  setShowing: (showing) => set({ isShowing: showing }),
}));
