import { Browser } from "@capacitor/browser";
import { toast } from "sonner";
import { afterSyncPath, syncSupabaseSession, type SyncSupabaseUser } from "./auth-sync";
import { NATIVE_AUTH_CALLBACK_URL } from "./deep-links";
import type { NativeAuthCallback } from "./native-runtime";
import { supabase } from "./supabase";

const GOOGLE_ERROR = "Errore durante l'accesso con Google";

/**
 * Native Google sign-in, step 1: asks Supabase for the OAuth URL (PKCE) without leaving the
 * WebView and opens it in a Custom Tab. Google → Supabase then redirect to
 * swimforge://auth/callback?code=..., which reopens the app (appUrlOpen, see native-runtime)
 * and lands in completeNativeAuthCallback.
 *
 * PKCE: signInWithOAuth stores the code verifier in the Supabase client storage, i.e. the
 * WebView localStorage. The WebView origin is stable (https://app.swimforge.it, see
 * capacitor.config.ts) and the app process normally survives while the Custom Tab is open,
 * so exchangeCodeForSession finds the verifier when the deep link comes back.
 *
 * Resolves once the Custom Tab is open; throws if the URL cannot be obtained.
 */
export async function startNativeGoogleLogin(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: NATIVE_AUTH_CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw error ?? new Error("Supabase did not return an OAuth URL");
  await Browser.open({ url: data.url });
}

export type CompleteNativeAuthOptions = {
  syncUser: SyncSupabaseUser;
  /** Called with /home, the onboarding path, or the acceptance step when it is missing. */
  onSignedIn: (path: string) => void | Promise<void>;
};

/**
 * Native Google sign-in, step 2 (deep link swimforge://auth/callback): closes the Custom Tab,
 * exchanges the code for a Supabase session, syncs it with the backend (stores the native
 * token) and hands over the next path. Errors are shown as toasts; returns whether it succeeded.
 */
export async function completeNativeAuthCallback(
  { code, error }: NativeAuthCallback,
  { syncUser, onSignedIn }: CompleteNativeAuthOptions,
): Promise<boolean> {
  await Browser.close().catch(() => {});

  if (error || !code) {
    console.error("[native-auth] OAuth callback error", error ?? "missing code");
    toast.error(GOOGLE_ERROR, { description: error ?? undefined });
    return false;
  }

  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !data.session) {
      throw exchangeError ?? new Error("Sessione OAuth non trovata");
    }
    const outcome = await syncSupabaseSession(data.session, syncUser);
    // Without accepted Termini and Privacy the next path is the acceptance step.
    if (!outcome.needsLegalAcceptance) toast.success("Accesso effettuato con successo!");
    await onSignedIn(afterSyncPath(outcome));
    return true;
  } catch (failure) {
    console.error("[native-auth] sign-in failed", failure);
    toast.error(GOOGLE_ERROR);
    return false;
  }
}
