/**
 * FCM push notifications (firebase-admin).
 *
 * Configured by FIREBASE_SERVICE_ACCOUNT_JSON (base64 of the service-account JSON).
 * Without it every send is a no-op and a single warning is logged. `sendPushToUser`
 * never throws: callers fire and forget.
 */
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { ENV } from "./_core/env";
import { deleteTokens, getUserNotificationSettings, listUserDeviceTokens } from "./db_device_tokens";
import { logger } from "./middleware/logger";
import type { PushPayload } from "./push_messages";

export type { PushPayload } from "./push_messages";

const log = logger.child({ component: "push" });

const FIREBASE_APP_NAME = "swimforge-push";
const FCM_BATCH_SIZE = 500;
const STALE_TOKEN_CODES = ["registration-token-not-registered", "invalid-registration-token"];

let pushApp: App | null = null;
let pushState: "unknown" | "enabled" | "disabled" = "unknown";

function parseServiceAccount(raw: string): Record<string, string> {
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  const parsed: unknown = JSON.parse(decoded);
  if (!parsed || typeof parsed !== "object" || typeof (parsed as Record<string, unknown>).private_key !== "string") {
    throw new Error("not a service-account JSON");
  }
  return parsed as Record<string, string>;
}

/** Lazily initialises firebase-admin once; returns whether push is enabled. */
export function initPush(): boolean {
  if (pushState !== "unknown") return pushState === "enabled";

  const raw = ENV.firebaseServiceAccountJson;
  if (!raw) {
    pushState = "disabled";
    log.warn("[push] FIREBASE_SERVICE_ACCOUNT_JSON not set: push notifications disabled", {
      event: "push:disabled",
    });
    return false;
  }

  try {
    const serviceAccount = parseServiceAccount(raw);
    pushApp =
      getApps().find((app) => app.name === FIREBASE_APP_NAME) ??
      initializeApp(
        { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
        FIREBASE_APP_NAME,
      );
    pushState = "enabled";
    log.info("[push] FCM push enabled", { event: "push:enabled", projectId: serviceAccount.project_id });
    return true;
  } catch {
    // Fixed reason only: the error text could echo parts of the credential.
    pushState = "disabled";
    log.warn("[push] Invalid FIREBASE_SERVICE_ACCOUNT_JSON: push notifications disabled", {
      event: "push:invalid_config",
      reason: "FIREBASE_SERVICE_ACCOUNT_JSON is not a base64-encoded service-account JSON",
    });
    return false;
  }
}

/** Test helper: forget the cached firebase state. */
export function resetPushForTests() {
  pushApp = null;
  pushState = "unknown";
}

function isDisabledSetting(value: unknown): boolean {
  return value === false || value === 0 || (typeof value === "string" && value.trim().toLowerCase() === "false");
}

function isStaleTokenError(code: string | undefined): boolean {
  if (!code) return false;
  return STALE_TOKEN_CODES.some((suffix) => code === suffix || code.endsWith(`/${suffix}`));
}

/**
 * Sends a notification to every device of the user.
 * Mirrors the in-app gate: nothing is sent when the profile has
 * `notification_settings.in_app_notifications` off (or `settingKey` off, if given).
 */
export async function sendPushToUser(
  userId: number,
  payload: PushPayload,
  options: { settingKey?: string } = {},
): Promise<{ sent: number; failed: number }> {
  if (!initPush() || !pushApp) return { sent: 0, failed: 0 };

  let tokens: string[];
  try {
    tokens = await listUserDeviceTokens(userId);
    if (tokens.length === 0) return { sent: 0, failed: 0 };

    const settings = await getUserNotificationSettings(userId);
    if (
      settings &&
      (isDisabledSetting(settings.in_app_notifications) ||
        (options.settingKey && isDisabledSetting(settings[options.settingKey])))
    ) {
      return { sent: 0, failed: 0 };
    }
  } catch (error) {
    log.warn("[push] Could not load device tokens", {
      event: "push:tokens_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { sent: 0, failed: 0 };
  }

  const data: Record<string, string> = { url: payload.url };
  if (payload.tag) data.tag = payload.tag;
  const androidNotification: { channelId: string; tag?: string } = { channelId: "default" };
  if (payload.tag) androidNotification.tag = payload.tag;

  let sent = 0;
  let failed = 0;
  const stale: string[] = [];
  let messaging: ReturnType<typeof getMessaging>;
  try {
    messaging = getMessaging(pushApp);
  } catch (error) {
    log.warn("[push] FCM messaging unavailable", {
      event: "push:messaging_unavailable",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return { sent: 0, failed: tokens.length };
  }

  for (let start = 0; start < tokens.length; start += FCM_BATCH_SIZE) {
    const batch = tokens.slice(start, start + FCM_BATCH_SIZE);
    try {
      const result = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: { title: payload.title, body: payload.body },
        data,
        android: { priority: "high", notification: androidNotification },
      });
      sent += result.successCount;
      failed += result.failureCount;
      result.responses.forEach((response, index) => {
        if (!response.success && isStaleTokenError(response.error?.code)) {
          stale.push(batch[index]);
        }
      });
    } catch (error) {
      failed += batch.length;
      log.warn("[push] FCM send failed", {
        event: "push:send_failed",
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (stale.length > 0) {
    try {
      await deleteTokens(stale);
    } catch (error) {
      log.warn("[push] Could not delete stale tokens", {
        event: "push:cleanup_failed",
        userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { sent, failed };
}
