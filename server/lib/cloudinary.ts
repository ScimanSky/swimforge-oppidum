import { ENV } from "../_core/env";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "cloudinary" });

export type CloudinaryCreditUsage = {
  used: number;
  limit: number;
  percentUsed: number;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickNestedNumber(payload: unknown, path: string[]): number | null {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return asFiniteNumber(cursor);
}

export async function getCloudinaryCreditUsage(): Promise<CloudinaryCreditUsage | null> {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    return null;
  }

  const auth = Buffer.from(`${ENV.cloudinaryApiKey}:${ENV.cloudinaryApiSecret}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${ENV.cloudinaryCloudName}/usage`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      log.warn("[Cloudinary] Failed to fetch usage", {
        event: "cloudinary:usage_failed",
        status: response.status,
        detail,
      });
      return null;
    }

    const payload = (await response.json()) as unknown;

    const used =
      pickNestedNumber(payload, ["credits", "usage"]) ??
      pickNestedNumber(payload, ["credits", "used"]) ??
      pickNestedNumber(payload, ["credit_usage", "used"]) ??
      null;
    const limit =
      pickNestedNumber(payload, ["credits", "limit"]) ??
      pickNestedNumber(payload, ["credit_usage", "limit"]) ??
      pickNestedNumber(payload, ["plan", "credit_limit"]) ??
      null;

    if (used === null || limit === null || limit <= 0) return null;

    const percentUsed = Number(((used / limit) * 100).toFixed(2));
    return { used, limit, percentUsed };
  } catch (error) {
    log.warn("[Cloudinary] Usage check error", {
      event: "cloudinary:usage_error",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
