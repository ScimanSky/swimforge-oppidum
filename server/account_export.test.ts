import { describe, expect, it, vi } from "vitest";
import {
  DATA_EXPORT_SECTIONS,
  DATA_EXPORT_VERSION,
  buildUserDataExport,
  writeUserDataExport,
} from "./account_export";

type Row = Record<string, unknown>;

/** The SQL text of a drizzle query, parameters as $n, plus the parameter values. */
function render(query: any): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const walk = (chunk: any): string => {
    if (chunk == null) return "";
    if (Array.isArray(chunk?.value)) return chunk.value.join("");
    if (Array.isArray(chunk?.queryChunks)) return chunk.queryChunks.map(walk).join("");
    params.push(chunk);
    return `$${params.length}`;
  };
  return { text: walk(query).replace(/\s+/g, " "), params };
}

/**
 * A database with the user 9: two Garmin swims, `laps` laps and `lengths` lengths, read the way
 * the export pages them (id > afterId ORDER BY id LIMIT n).
 */
function fakeDb(options: { laps?: number; lengths?: number; missing?: RegExp } = {}) {
  const laps: Row[] = Array.from({ length: options.laps ?? 3 }, (_, i) => ({
    id: i + 1,
    activity_id: 11,
    lap_index: i,
    distance_meters: 100,
    duration_seconds: 95.5,
    avg_heart_rate: 140,
  }));
  const lengths: Row[] = Array.from({ length: options.lengths ?? 6 }, (_, i) => ({
    id: i + 1,
    activity_id: 11,
    lap_id: Math.floor(i / 2) + 1,
    length_index: i,
    distance_meters: 50,
    duration_seconds: 47.5,
    total_number_of_strokes: 18,
  }));
  const queries: string[] = [];
  const page = (rows: Row[], params: unknown[]) => {
    const [, afterId, limit] = params as number[];
    return rows.filter((row) => Number(row.id) > afterId).slice(0, limit);
  };
  const db = {
    execute: vi.fn(async (query: any) => {
      const { text, params } = render(query);
      queries.push(text);
      if (options.missing?.test(text)) throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
      if (text.includes("FROM users")) {
        return { rows: [{ id: 9, name: "Ada", email: "ada@example.com", created_at: new Date("2026-01-01T00:00:00Z") }] };
      }
      if (text.includes("FROM swimmer_profiles")) {
        return {
          rows: [
            {
              user_id: 9,
              garmin_token_encrypted: "enc:secret-token",
              // jsonb in production, text in some older setups: both are read.
              preferences: JSON.stringify({
                theme: "dark",
                cssTest: { date: "2026-10-01", t400Seconds: 360, t200Seconds: 170 },
                paceZones: { bounds: [128, 120, 114, 108, 104, 100], updatedAt: "2026-10-02T00:00:00.000Z" },
              }),
            },
          ],
        };
      }
      if (text.includes("FROM garmin_activity_laps")) return { rows: page(laps, params) };
      if (text.includes("FROM garmin_activity_lengths")) return { rows: page(lengths, params) };
      if (text.includes("FROM swimming_activities")) {
        return { rows: page([{ id: 11, user_id: 9, distance_meters: 1500, raw_data: { activity: { activityId: 1 } } }, { id: 12, user_id: 9, distance_meters: 1000 }], params) };
      }
      if (text.includes("FROM activity_ai_insights")) return { rows: [{ id: 1, user_id: 9, activity_id: 11, title: "Ritmo costante" }] };
      if (text.includes("FROM ai_insights_cache")) return { rows: [{ id: 2, user_id: 9, insights: ["📈 Progressione: bene"] }] };
      if (text.includes("FROM ai_coach_workouts")) return { rows: [{ id: 3, user_id: 9, workout_type: "pool" }] };
      return { rows: [] };
    }),
  };
  return { db, queries };
}

async function writtenExport(db: { execute: (q: any) => Promise<{ rows: unknown[] }> }, pageSize?: number) {
  const chunks: string[] = [];
  await writeUserDataExport(db, 9, (chunk) => void chunks.push(chunk), pageSize);
  return { chunks, json: JSON.parse(chunks.join("")) };
}

describe("data export", () => {
  it("is JSON with a version, the user, the profile without secrets and the swim settings", async () => {
    const { json } = await writtenExport(fakeDb().db);
    expect(json.version).toBe(DATA_EXPORT_VERSION);
    expect(json.version).toBe(2);
    expect(typeof json.exportedAt).toBe("string");
    expect(json.user).toMatchObject({ id: 9, email: "ada@example.com", created_at: "2026-01-01T00:00:00.000Z" });
    expect(json.profile).toMatchObject({ user_id: 9 });
    expect(json.profile).not.toHaveProperty("garmin_token_encrypted");
    expect(JSON.stringify(json)).not.toContain("secret-token");
    expect(json.swimSettings).toEqual({
      cssTest: { date: "2026-10-01", t400Seconds: 360, t200Seconds: 170 },
      paceZones: { bounds: [128, 120, 114, 108, 104, 100], updatedAt: "2026-10-02T00:00:00.000Z" },
    });
  });

  it("has the user's laps, lengths and AI coach rows", async () => {
    const { json } = await writtenExport(fakeDb().db);
    expect(Object.keys(json.data)).toEqual(DATA_EXPORT_SECTIONS);
    expect(json.data.laps).toHaveLength(3);
    expect(json.data.laps[0]).toMatchObject({ activity_id: 11, lap_index: 0, duration_seconds: 95.5, avg_heart_rate: 140 });
    expect(json.data.lengths).toHaveLength(6);
    expect(json.data.lengths[5]).toMatchObject({ lap_id: 3, length_index: 5, total_number_of_strokes: 18 });
    expect(json.data.activities.map((row: Row) => row.id)).toEqual([11, 12]);
    expect(json.data.activityInsights).toEqual([{ id: 1, user_id: 9, activity_id: 11, title: "Ritmo costante" }]);
    expect(json.data.coachInsights).toHaveLength(1);
    expect(json.data.coachWorkouts).toHaveLength(1);
  });

  it("reads only the user's own laps and lengths, through their swims", async () => {
    const { db, queries } = fakeDb();
    await writtenExport(db);
    const lapQuery = queries.find((text) => text.includes("FROM garmin_activity_laps"));
    const lengthQuery = queries.find((text) => text.includes("FROM garmin_activity_lengths"));
    expect(lapQuery).toContain("JOIN swimming_activities a ON a.id = l.activity_id WHERE a.user_id = $1");
    expect(lengthQuery).toContain("JOIN swimming_activities a ON a.id = g.activity_id WHERE a.user_id = $1");
  });

  it("streams thousands of laps page by page, never holding more than a page", async () => {
    const { db, queries } = fakeDb({ laps: 4_500, lengths: 18_000 });
    const { chunks, json } = await writtenExport(db, 1000);
    expect(json.data.laps).toHaveLength(4_500);
    expect(json.data.lengths).toHaveLength(18_000);
    expect(json.data.lengths.map((row: Row) => row.id)).toEqual(Array.from({ length: 18_000 }, (_, i) => i + 1));
    // 5 pages of laps (the last one short), 18 full pages of lengths and an empty one.
    expect(queries.filter((text) => text.includes("FROM garmin_activity_laps"))).toHaveLength(5);
    expect(queries.filter((text) => text.includes("FROM garmin_activity_lengths"))).toHaveLength(19);
    // Each chunk is at most one page: about 100 bytes a row here, so well under 200 KB.
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(200_000);
  });

  it("builds the same document in memory for the tRPC endpoint", async () => {
    const built = await buildUserDataExport(fakeDb().db, 9);
    const { json } = await writtenExport(fakeDb().db);
    expect({ ...built, exportedAt: "x" }).toEqual({ ...json, exportedAt: "x" });
  });

  it("leaves a section empty when its table is missing", async () => {
    const { json } = await writtenExport(fakeDb({ missing: /FROM ai_insights_cache/ }).db);
    expect(json.data.coachInsights).toEqual([]);
    expect(json.data.laps).toHaveLength(3);
  });
});
