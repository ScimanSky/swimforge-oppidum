import type { Session } from "@supabase/supabase-js";
import { homePathForPlatform } from "./navigation";
import { isNativePlatform } from "./platform";
import { registerPushToken } from "./push";
import { setNativeSessionToken } from "./session-token";

/** The registration checkboxes: Termini, Privacy, «Dichiaro di avere almeno 14 anni». */
export type LegalAcceptance = { terms: true; privacy: true; minimumAge: true };
export const LEGAL_ACCEPTANCE: LegalAcceptance = { terms: true, privacy: true, minimumAge: true };

/**
 * Kept in the Supabase user metadata at email sign-up, so the acceptance given on the form
 * survives the confirmation email.
 */
export const LEGAL_ACCEPTANCE_METADATA_KEY = "swimforge_legal_acceptance";

export type SyncSupabaseUserInput = {
  accessToken: string;
  user: { id: string; email: string; name: string | null };
  legalAcceptance?: LegalAcceptance;
};

export type SyncSupabaseUserResult = { isNewUser?: boolean; sessionToken?: string; needsLegalAcceptance?: boolean };

/** auth.syncSupabaseUser, e.g. `(input) => utils.client.auth.syncSupabaseUser.mutate(input)`. */
export type SyncSupabaseUser = (input: SyncSupabaseUserInput) => Promise<SyncSupabaseUserResult>;

export type SyncFallback = { email?: string; name?: string | null };

export const ONBOARDING_PATH = "/settings?tab=profile&onboarding=1";
/** The acceptance step of a sign-in without accepted Termini and Privacy (e.g. Google). */
export const LEGAL_ACCEPTANCE_PATH = "/auth/consenso";

export type SyncOutcome = { isNewUser: boolean; needsLegalAcceptance: boolean };

/** Where to go after a sync: the acceptance step when it is missing, else postLoginPath. */
export function afterSyncPath(outcome: SyncOutcome): string {
  return outcome.needsLegalAcceptance ? LEGAL_ACCEPTANCE_PATH : postLoginPath(outcome.isNewUser);
}

function metadataAcceptance(metadata: Record<string, unknown>): LegalAcceptance | undefined {
  const value = metadata[LEGAL_ACCEPTANCE_METADATA_KEY] as Partial<Record<keyof LegalAcceptance, unknown>> | undefined;
  return value && value.terms === true && value.privacy === true && value.minimumAge === true ? LEGAL_ACCEPTANCE : undefined;
}
/** Where to go after a successful sign-in: onboarding, else Oggi in the app and the feed on the web. */
export function postLoginPath(isNewUser: boolean): string {
  return isNewUser ? ONBOARDING_PATH : homePathForPlatform(isNativePlatform());
}

/**
 * Syncs a Supabase session with the backend (auth.syncSupabaseUser: cookie on the web,
 * bearer token in the response on native) and stores the native token when present; on
 * native it then starts the push registration (fire-and-forget).
 * `fallback` fills email/name when the Supabase user lacks them (e.g. the form values).
 * With `needsLegalAcceptance` there is no backend session yet: the caller goes to the acceptance
 * step (afterSyncPath), which syncs again with the user's acceptance.
 * Throws when the server call fails.
 */
export async function syncSupabaseSession(
  session: Pick<Session, "access_token" | "user">,
  syncUser: SyncSupabaseUser,
  fallback: SyncFallback = {},
  legalAcceptance?: LegalAcceptance,
): Promise<SyncOutcome> {
  const metadata = (session.user.user_metadata ?? {}) as { full_name?: unknown; name?: unknown } & Record<string, unknown>;
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
    // Ticked now, or on the sign-up form before the confirmation email; never assumed.
    ...(legalAcceptance ?? metadataAcceptance(metadata) ? { legalAcceptance: legalAcceptance ?? metadataAcceptance(metadata) } : {}),
  });

  if (result.needsLegalAcceptance) return { isNewUser: Boolean(result.isNewUser), needsLegalAcceptance: true };

  if (typeof result.sessionToken === "string" && result.sessionToken) {
    await setNativeSessionToken(result.sessionToken);
    void registerPushToken();
  }
  return { isNewUser: Boolean(result.isNewUser), needsLegalAcceptance: false };
}
