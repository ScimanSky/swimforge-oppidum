import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./middleware/logger";

const log = logger.child({ component: "product_analytics" });

export const PRODUCT_ANALYTICS_EVENT_NAMES = [
  "season_view",
  "season_next_action_click",
  "pb_detected",
  "pb_celebration_open",
  "pb_share_click",
  "pb_share_success",
  "season_step_view",
  "season_step_action_click",
  "ghost_duel_create",
  "ghost_track_open",
  "club_workout_open",
  "club_workout_complete",
  "feed_post_create",
  "feed_post_view",
  "activity_synced",
  "profile_pb_view",
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number];

let schemaReadyPromise: Promise<void> | null = null;

function sanitizeMetadata(
  metadata?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | null {
  if (!metadata) return null;
  const output: Record<string, string | number | boolean | null> = {};
  let count = 0;
  for (const [key, value] of Object.entries(metadata)) {
    if (count >= 24) break;
    const trimmedKey = key.trim().slice(0, 48);
    if (!trimmedKey) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[trimmedKey] = typeof value === "string" ? value.slice(0, 240) : value;
      count += 1;
    }
  }
  return Object.keys(output).length > 0 ? output : null;
}

async function ensureProductAnalyticsSchema(): Promise<void> {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS product_engagement_events (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        event_name VARCHAR(80) NOT NULL,
        source VARCHAR(80),
        entity_type VARCHAR(80),
        entity_id INTEGER,
        metadata JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS product_engagement_events_user_time_idx
      ON product_engagement_events (user_id, created_at DESC)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS product_engagement_events_event_time_idx
      ON product_engagement_events (event_name, created_at DESC)
    `);
  })();

  await schemaReadyPromise;
}

export async function trackProductEvent(params: {
  userId: number;
  eventName: ProductAnalyticsEventName;
  source?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  try {
    await ensureProductAnalyticsSchema();
    const db = await getDb();
    if (!db) return;

    const source = params.source?.trim().slice(0, 80) || null;
    const entityType = params.entityType?.trim().slice(0, 80) || null;
    const metadata = sanitizeMetadata(params.metadata);
    const entityId =
      Number.isFinite(Number(params.entityId)) && Number(params.entityId) > 0
        ? Number(params.entityId)
        : null;

    await db.execute(sql`
      INSERT INTO product_engagement_events (
        user_id, event_name, source, entity_type, entity_id, metadata, created_at
      ) VALUES (
        ${params.userId},
        ${params.eventName},
        ${source},
        ${entityType},
        ${entityId},
        ${metadata ? sql`${JSON.stringify(metadata)}::jsonb` : null},
        NOW()
      )
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[product_analytics] failed to persist event", {
      event: "product_analytics:persist_failed",
      userId: params.userId,
      eventName: params.eventName,
      message,
    });
  }
}
