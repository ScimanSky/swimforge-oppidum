import { useMemo, useState } from "react";

export type ArchiveRange = "all" | "7d" | "30d" | "90d";
export type ArchiveSort = "recent" | "oldest" | "distance" | "duration";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Record<ArchiveRange, number | null> = {
  all: null,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
  "90d": 90 * DAY_MS,
};

/** Bullets stored as a JSON array, a plain string or an array; [] otherwise. */
export const parseBulletsSafe = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item)).filter(Boolean);
      }
    } catch {
      // ignore parse errors and fallback to plain string
    }
    return value.trim().length > 0 ? [value] : [];
  }
  return [];
};

const normalizeDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

export type SessionEntry = Record<string, any> & {
  _date: Date | null;
  _sort: number;
  _bullets: string[];
};

/**
 * Session analyses newest first (`entries`, `latest`) and the archive view over them: text
 * search on title, summary and bullets, a period filter and four sort orders.
 */
export function useSessionArchive(data: readonly any[] | undefined) {
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<ArchiveRange>("all");
  const [sort, setSort] = useState<ArchiveSort>("recent");

  const entries = useMemo((): SessionEntry[] => {
    return (data ?? [])
      .map((item: any) => {
        const date =
          normalizeDate(item.activity_date) ||
          normalizeDate(item.activityDate) ||
          normalizeDate(item.generated_at) ||
          normalizeDate(item.generatedAt);
        return {
          ...item,
          _date: date,
          _sort: date ? date.getTime() : 0,
          _bullets: parseBulletsSafe(item.bullets),
        };
      })
      .sort((a, b) => b._sort - a._sort);
  }, [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();
    const rangeMs = RANGE_MS[range];

    const list = entries.filter(entry => {
      if (rangeMs !== null) {
        if (!entry._date) return false;
        if (now - entry._date.getTime() > rangeMs) return false;
      }
      if (!term) return true;
      const content =
        `${String(entry.title ?? "")} ${String(entry.summary ?? "")} ${entry._bullets.join(" ")}`.toLowerCase();
      return content.includes(term);
    });

    list.sort((a, b) => {
      if (sort === "oldest") return a._sort - b._sort;
      if (sort === "distance") {
        return Number(b.activity_distance_meters ?? 0) - Number(a.activity_distance_meters ?? 0);
      }
      if (sort === "duration") {
        return Number(b.activity_duration_seconds ?? 0) - Number(a.activity_duration_seconds ?? 0);
      }
      return b._sort - a._sort;
    });

    return list;
  }, [entries, range, search, sort]);

  return {
    entries,
    latest: entries[0] ?? null,
    filtered,
    search,
    setSearch,
    range,
    setRange,
    sort,
    setSort,
  };
}
