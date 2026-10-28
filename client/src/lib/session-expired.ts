import { settleWithin, unregisterPushTokenLocally } from "./push";
import { clearNativeSessionToken } from "./session-token";

/** The device-side push cleanup never delays the redirect longer than this. */
export const SESSION_EXPIRED_PUSH_TIMEOUT_MS = 1000;

let ending: Promise<void> | null = null;

/**
 * Session rejected by the server (401): deletes the FCM token on the device (the server call
 * would fail without a session), then clears the native session token and redirects. The
 * cleanup is awaited (max 1 s) so the page does not unload before it runs. Repeated 401s
 * while this runs share the same call.
 */
export function endExpiredSession(redirect: () => void): Promise<void> {
  ending ??= (async () => {
    await settleWithin(unregisterPushTokenLocally(), SESSION_EXPIRED_PUSH_TIMEOUT_MS);
    clearNativeSessionToken();
    redirect();
  })().finally(() => {
    ending = null;
  });
  return ending;
}
