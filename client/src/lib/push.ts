import { PushNotifications } from "@capacitor/push-notifications";
import { toast } from "sonner";
import { isNativePlatform } from "./platform";
import { vanillaTrpc } from "./trpc-client";

const FALLBACK_PATH = "/home";
/** Must match the server's android.notification.channelId (server/push.ts). */
export const PUSH_CHANNEL_ID = "default";

type Navigate = (path: string) => void;

/** Injected by the native runtime (wouter navigate); full-page fallback until then. */
let navigate: Navigate = (path) => {
  window.location.assign(path);
};
/** The FCM token registered with the server in this process (needed to unregister it). */
let currentToken: string | null = null;
let listenersAdded = false;
let inFlight: Promise<void> | null = null;
/** Logout waits for push.unregister: never longer than this. */
const UNREGISTER_TIMEOUT_MS = 3000;

export function setPushNavigate(next: Navigate): void {
  navigate = next;
}

/**
 * In-app path to open for a notification payload: `data.url` when it is a same-app path
 * ("/..." without "//" or a scheme), else /home.
 */
export function resolvePushUrl(data: unknown): string {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  if (typeof url !== "string") return FALLBACK_PATH;
  // Backslashes and whitespace/control characters can be normalized into "//host" by URL parsing.
  if (!url.startsWith("/") || url.includes("//") || /[\\\s\u0000-\u001f]/.test(url)) return FALLBACK_PATH;
  return url;
}

function appVersion(): string {
  return typeof __APP_VERSION__ === "string" && __APP_VERSION__ ? __APP_VERSION__ : "dev";
}

async function addListenersOnce(): Promise<void> {
  if (listenersAdded) return;
  listenersAdded = true;
  // A full page reload keeps the native plugin alive: drop listeners of the previous page.
  await PushNotifications.removeAllListeners().catch(() => {});
  await Promise.all([
    PushNotifications.addListener("registration", ({ value }) => {
      vanillaTrpc.push.register
        .mutate({ token: value, platform: "android", appVersion: appVersion() })
        .then(() => {
          currentToken = value;
        })
        .catch((error: unknown) => {
          console.warn("[push] token registration failed", error);
        });
    }),
    PushNotifications.addListener("registrationError", (error) => {
      console.warn("[push] FCM registration error", error);
    }),
    PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const path = resolvePushUrl(notification.data);
      toast(notification.title || "SwimForge", {
        description: notification.body,
        action: { label: "Apri", onClick: () => navigate(path) },
      });
    }),
    PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      navigate(resolvePushUrl(action.notification?.data));
    }),
  ]);
}

async function register(): Promise<void> {
  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") return;

  await PushNotifications.createChannel({
    id: PUSH_CHANNEL_ID,
    name: "Notifiche SwimForge",
    importance: 4,
  }).catch(() => {});
  await addListenersOnce();
  // The token arrives through the "registration" listener (also on FCM token refresh).
  await PushNotifications.register();
}

/**
 * Native only (no-op on the web): asks the notification permission when needed, creates the
 * Android channel, wires the listeners (once) and registers with FCM; the token is sent to
 * push.register. Never throws; concurrent calls share the same attempt.
 */
export function registerPushToken(): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  inFlight ??= register()
    .catch((error: unknown) => {
      console.warn("[push] registration failed", error);
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Native only (no-op on the web): removes the token from the server (needs the session, so
 * call it before the server logout; capped at 3 s) and deletes it on the device, so a token
 * left on the server goes stale and is pruned on the next send. Never throws.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!isNativePlatform()) return;
  const token = currentToken;
  currentToken = null;
  if (token) {
    await Promise.race([
      vanillaTrpc.push.unregister.mutate({ token }).catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, UNREGISTER_TIMEOUT_MS)),
    ]);
  }
  await PushNotifications.unregister().catch(() => {});
}

/** Test helper: resets the module state. */
export function resetPushStateForTests(): void {
  currentToken = null;
  listenersAdded = false;
  inFlight = null;
  navigate = (path) => {
    window.location.assign(path);
  };
}
