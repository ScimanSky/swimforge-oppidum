import type { Session } from "@supabase/supabase-js";
import { registerPushToken } from "./push";
import { setNativeSessionToken } from "./session-token";

export type SyncSupabaseUserInput = {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
};

export type SyncSupabaseUserResult = { isNewUser?: boolean; sessionToken?: string };

/** auth.syncSupabaseUser, e.g. `(input) => utils.client.auth.syncSupabaseUser.mutate(input)`. */
export type SyncSupabaseUser = (input: SyncSupabaseUserInput) => Promise<SyncSupabaseUserResult>;

export type SyncFallback = { email?: string; name?: string | null };

export const ONBOARDING_PATH = "/settings?tab=profile&onboarding=1";
export const HOME_PATH = "/home";

/** Where to go after a successful sign-in. */
export function postLoginPath(isNewUser: boolean): string {
  return isNewUser ? ONBOARDING_PATH : HOME_PATH;
}

/**
 * Syncs a Supabase session with the backend (auth.syncSupabaseUser: cookie on the web,
 * bearer token in the response on native) and stores the native token when present; on
 * native it then starts the push registration (fire-and-forget).
 * `fallback` fills email/name when the Supabase user lacks them (e.g. the form values).
 * Throws when the server call fails.
 */
export async function syncSupabaseSession(
  session: Pick<Session, "access_token" | "user">,
  syncUser: SyncSupabaseUser,
  fallback: SyncFallback = {},
): Promise<{ isNewUser: boolean }> {
  const metadata = (session.user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const metadataName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    null;

  const result = await syncUser({
    accessToken: session.access_token,
    user: {
      id: session.user.id,
      email: session.user.email || fallback.email || "",
      name: metadataName || fallback.name || null,
    },
  });

  if (typeof result.sessionToken === "string" && result.sessionToken) {
    await setNativeSessionToken(result.sessionToken);
    void registerPushToken();
  }
  return { isNewUser: Boolean(result.isNewUser) };
}
