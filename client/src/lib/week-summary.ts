export type WeekActivity = {
  activityDate: string | Date;
  distanceMeters: number;
  xpEarned?: number | null;
};
export type WeekDay = { label: string; meters: number; isToday: boolean };
export type WeekSummary = {
  totalMeters: number;
  sessions: number;
  xp: number;
  days: WeekDay[];
};

const LABELS = ["L", "M", "M", "G", "V", "S", "D"];

/** Monday 00:00 local time of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (start.getDay() + 6) % 7; // Monday = 0
  start.setDate(start.getDate() - offset);
  return start;
}

/** Totals and per-day metres (Mon-Sun) of the local week containing `now`. */
export function summarizeWeek(
  activities: readonly WeekActivity[],
  now: Date
): WeekSummary {
  const start = startOfWeek(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const todayIndex = (now.getDay() + 6) % 7;
  const days: WeekDay[] = LABELS.map((label, index) => ({
    label,
    meters: 0,
    isToday: index === todayIndex,
  }));
  let sessions = 0;
  let xp = 0;
  for (const activity of activities) {
    const date =
      activity.activityDate instanceof Date
        ? activity.activityDate
        : new Date(activity.activityDate);
    if (date < start || date >= end) continue;
    const index = (date.getDay() + 6) % 7; // exact in local time, also across DST changes
    days[index].meters += activity.distanceMeters;
    sessions += 1;
    xp += activity.xpEarned ?? 0;
  }
  return {
    totalMeters: days.reduce((sum, day) => sum + day.meters, 0),
    sessions,
    xp,
    days,
  };
}
