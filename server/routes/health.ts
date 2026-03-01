import { Router } from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { redis } from "../lib/cache";
import { getRedisPolicy } from "../lib/redis-policy";
import { logger } from "../middleware/logger";

export const healthRouter = Router();

type HealthChecks = {
  database: boolean;
  redis: boolean;
  garminService: boolean;
  storage: boolean;
  timestamp: string;
};

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

async function runHealthChecks(): Promise<{ checks: HealthChecks; details: Record<string, any> }> {
  const checks: HealthChecks = {
    database: false,
    redis: false,
    garminService: false,
    storage: false,
    timestamp: new Date().toISOString(),
  };
  const details: Record<string, any> = {};

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

  return { checks, details };
}

function summarizeChecks(checks: HealthChecks) {
  const availabilityFailures: string[] = [];
  if (!checks.database) availabilityFailures.push("database");
  if (!checks.redis) availabilityFailures.push("redis");

  const deepFailures: string[] = [...availabilityFailures];
  if (!checks.garminService) deepFailures.push("garminService");
  if (!checks.storage) deepFailures.push("storage");

  const availabilityOk = availabilityFailures.length === 0;
  const deepOk = deepFailures.length === 0;

  return { availabilityOk, deepOk, availabilityFailures, deepFailures };
}

healthRouter.get("/health", async (_req, res) => {
  const { checks, details } = await runHealthChecks();
  const summary = summarizeChecks(checks);
  const status = summary.availabilityOk
    ? summary.deepOk
      ? "healthy"
      : "degraded"
    : "unhealthy";

  res.status(summary.availabilityOk ? 200 : 503).json({
    status,
    checks,
    availability: {
      ok: summary.availabilityOk,
      failures: summary.availabilityFailures,
    },
    deep: {
      ok: summary.deepOk,
      failures: summary.deepFailures,
    },
    details,
  });
});

// Deep health endpoint: fails if any optional integration is down.
healthRouter.get("/health/deep", async (_req, res) => {
  const { checks, details } = await runHealthChecks();
  const summary = summarizeChecks(checks);

  res.status(summary.deepOk ? 200 : 503).json({
    status: summary.deepOk ? "healthy" : "unhealthy",
    checks,
    availability: {
      ok: summary.availabilityOk,
      failures: summary.availabilityFailures,
    },
    deep: {
      ok: summary.deepOk,
      failures: summary.deepFailures,
    },
    details,
  });
});

// Kubernetes readiness probe: keep it cheap, but reflect critical dependencies.
healthRouter.get("/ready", async (_req, res) => {
  const redisPolicy = getRedisPolicy();

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

  let redisOk = true;
  if (redisPolicy.redisConfigured) {
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

  const ready = dbOk && (!redisPolicy.redisRequiredForReady || redisOk);
  res.status(ready ? 200 : 503).json({
    ready,
    database: dbOk,
    redis: redisOk,
    redisConfigured: redisPolicy.redisConfigured,
    redisRequiredForReady: redisPolicy.redisRequiredForReady,
  });
});
