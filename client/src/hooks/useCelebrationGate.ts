import { useLayoutEffect } from "react";
import { create } from "zustand";

/**
 * The one place that decides when the celebration popups (new badge, new PB, analysis ready)
 * may open. While the cookie banner or the onboarding owns the screen they wait, queued, and
 * open once it is gone: a Radix modal under them would take the taps meant for the banner or
 * the tour (body `pointer-events: none`) and be dismissed unseen.
 */
export type CelebrationBlocker = "cookie-banner" | "onboarding";

/** Above the cookie banner (z-[85]) and the onboarding (z-[120]), should one open later. */
export const CELEBRATION_LAYER = "z-[130]";

type CelebrationGateStore = {
  blockers: readonly CelebrationBlocker[];
  setBlocked: (blocker: CelebrationBlocker, blocked: boolean) => void;
};

export const useCelebrationGate = create<CelebrationGateStore>((set) => ({
  blockers: [],
  setBlocked: (blocker, blocked) =>
    set((state) => {
      if (state.blockers.includes(blocker) === blocked) return state;
      return {
        blockers: blocked ? [...state.blockers, blocker] : state.blockers.filter((item) => item !== blocker),
      };
    }),
}));

/** Holds the celebrations back while `active` (and lets them go when the caller unmounts). */
export function useHoldCelebrations(blocker: CelebrationBlocker, active: boolean) {
  const setBlocked = useCelebrationGate((state) => state.setBlocked);
  // Layout effect: the gate closes before the browser paints a popup under the blocker.
  useLayoutEffect(() => {
    setBlocked(blocker, active);
    return () => setBlocked(blocker, false);
  }, [active, blocker, setBlocked]);
}

/** Whether a celebration popup may open now; until then it stays queued. */
export function useCelebrationsAllowed(): boolean {
  return useCelebrationGate((state) => state.blockers.length === 0);
}
