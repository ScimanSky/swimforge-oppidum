import { NO_VALUE, formatDayMonthYear, formatWeekdayDayMonth } from "@/lib/format";

const pad2 = (value: number) => String(value).padStart(2, "0");

/**
 * A workout's session day («2026-10-29», or a timestamp) as a local date: a bare day is never
 * moved by the UTC offset (`new Date("2026-10-29")` is the 28th west of Greenwich). Null when
 * missing or invalid.
 */
export function parseSessionDay(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = bare ? new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3])) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local «2026-10-29» of a session day, to group workouts and find today's; "" without a valid day. */
export function sessionDayKey(value: unknown): string {
  const date = parseSessionDay(value);
  return date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : "";
}

/** «gio 29 ott», or «29 ott 2025» for another year; «—» without a valid day. */
export function formatSessionDay(value: unknown, now = new Date()): string {
  const date = parseSessionDay(value);
  if (!date) return NO_VALUE;
  return date.getFullYear() === now.getFullYear() ? formatWeekdayDayMonth(date) : formatDayMonthYear(date);
}

/** A plan's free-text fact («2500m», «60 min»), or null when it is missing or «n/d». */
export function planFact(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.toLowerCase() !== "n/d" ? text : null;
}
