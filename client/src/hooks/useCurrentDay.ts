import { useEffect, useState } from "react";

/** Local calendar day, `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** A little past the next local midnight, so the timer never fires on the old day. */
const msToNextMidnight = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000;

/**
 * The current local day for screens kept mounted across days (the app resumed the next
 * morning). Updates at local midnight and when the page becomes visible again (timers are
 * throttled in the background). `now` is a moment of that day and keeps its identity until
 * the day changes, so it can be a memo dependency.
 */
export function useCurrentDay(): { dayKey: string; now: Date } {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const next = new Date();
      setNow(previous => (localDayKey(previous) === localDayKey(next) ? previous : next));
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        arm();
      }, msToNextMidnight(new Date()));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return { dayKey: localDayKey(now), now };
}
