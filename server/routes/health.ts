import { Router } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { redis } from "../lib/cache";
import { logger } from "../middleware/logger";

export const healthRouter = Router();

function isProbablyConfiguredRedisUrl(value: string | undefined): value is string {
  return Boolean(value && /^rediss?:\/\//i.test(value));
}

async function fetchOkWithTimeout(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } finally {
    clearTimeout(timeout);
  }
}

healthRouter.get("/health", async (_req, res) => {
  const checks = {
    database: false,
    redis: false,
    garminService: false,
    storage: false,
    timestamp: new Date().toISOString(),
  };

  const details: Record<string, any> = {};

  // Check database
  try {
    const db = await getDb();
    if (db) {
      await db.execute(sql`SELECT 1`);
      checks.database = true;
    } else {
      details.database = { message: "db not initialized" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    details.database = { message };
    logger.warn(`Health check DB failed: ${message}`, {
      event: "health:db_failed",
      message,
    });
  }

  // Check Redis
  try {
    if (redis.isOpen) {
      await redis.ping();
      checks.redis = true;
    } else {
      details.redis = { message: "redis not connected" };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    details.redis = { message };
    logger.warn(`Health check Redis failed: ${message}`, {
      event: "health:redis_failed",
      message,
    });
  }

  // Check Garmin service (optional)
  try {
    const baseUrl = process.env.GARMIN_SERVICE_URL || "http://localhost:8000";
    const url = `${baseUrl.replace(/\/$/, "")}/health`;
    checks.garminService = await fetchOkWithTimeout(url, 3000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    details.garminService = { message };
    // Garmin is an external dependency; keep this a warning.
    logger.warn(`Health check Garmin failed: ${message}`, {
      event: "health:garmin_failed",
      message,
    });
  }

  // Check storage (Supabase) using admin client if configured
  try {
    // Lazy import to avoid forcing Supabase env in all environments.
    const { getSupabaseAdminClient } = await import("../_core/supabase_admin");
    const admin = getSupabaseAdminClient();
    const result = await admin.storage.listBuckets();
    if (!result.error) {
      checks.storage = true;
    } else {
      details.storage = { message: result.error.message };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    details.storage = { message };
    logger.warn(`Health check storage failed: ${message}`, {
      event: "health:storage_failed",
      message,
    });
  }

  const isHealthy = Object.values(checks).every(
    (v) => v === true || typeof v === "string"
  );

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "unhealthy",
    checks,
    details,
  });
});

// Kubernetes readiness probe: keep it cheap, but reflect critical dependencies.
healthRouter.get("/ready", async (_req, res) => {
  let dbOk = false;
  try {
    const db = await getDb();
    if (db) {
      await db.execute(sql`SELECT 1`);
      dbOk = true;
    }
  } catch {
    dbOk = false;
  }

  const redisConfigured = isProbablyConfiguredRedisUrl(process.env.REDIS_URL);
  let redisOk = true;
  if (redisConfigured) {
    try {
      if (redis.isOpen) {
        await redis.ping();
        redisOk = true;
      } else {
        redisOk = false;
      }
    } catch {
      redisOk = false;
    }
  }

  const ready = dbOk && redisOk;
  res.status(ready ? 200 : 503).json({ ready, database: dbOk, redis: redisOk });
});
