import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Loader2, MailCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Wordmark } from "@/components/corsia/Wordmark";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { postLoginPath, syncSupabaseSession } from "@/lib/auth-sync";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

const PKCE_VERIFIER_MISSING_RE = /pkce code verifier not found|code verifier/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SIGN_IN_FAILED = "Accesso non riuscito. Riprova.";
const SESSION_EXPIRED = "Sessione di accesso scaduta o non valida. Riprova ad accedere.";
const NO_SESSION = "Sessione di accesso non trovata. Riprova ad accedere.";

type Status = "loading" | "success" | "error" | "confirmed";

/**
 * `/auth/callback` on the web: return from Google (PKCE code or implicit tokens) and the link of
 * the sign-up confirmation email. A public page: its state is the page's h1.
 */
export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const utils = trpc.useUtils();

  // The redirects run later: none once the page is gone (cleared on unmount, and none started
  // by a callback that finishes after it).
  const unmountedRef = useRef(false);
  const redirectTimerRef = useRef<number | undefined>(undefined);
  const redirectLater = (redirect: () => void, delayMs: number) => {
    if (unmountedRef.current) return;
    window.clearTimeout(redirectTimerRef.current);
    redirectTimerRef.current = window.setTimeout(redirect, delayMs);
  };
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      window.clearTimeout(redirectTimerRef.current);
    };
  }, []);

  const syncWithBackend = async (session: Parameters<typeof syncSupabaseSession>[0]) => {
    try {
      const { isNewUser } = await syncSupabaseSession(session, (input) =>
        utils.client.auth.syncSupabaseUser.mutate(input),
      );
      console.log('[AuthCallback] syncSupabaseUser SUCCESS:', session.user.id);
      setStatus("success");
      toast.success("Accesso effettuato con successo!");
      redirectLater(() => {
        const target = postLoginPath(isNewUser);
        console.log('[AuthCallback] Redirecting to:', target);
        window.location.href = target;
      }, 1000);
    } catch (error) {
      // The server's messages for this step are English: the Italian fallback instead.
      console.error('[AuthCallback] syncSupabaseUser ERROR:', error);
      setStatus("error");
      setErrorMessage(SIGN_IN_FAILED);
    }
  };

  const waitForSession = async (attempts = 8, delayMs = 250) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session;
      await sleep(delayMs);
    }
    return null;
  };

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('[AuthCallback] Starting auth callback...');

        let session = null;
        let error = null;
        let verifierMissing = false;

        // 1. Check for PKCE flow (code in query params)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');

        // 2. Check for implicit flow (tokens in hash fragment)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        console.log('[AuthCallback] Params:', { hasCode: !!code, hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });

        if (accessToken) {
          // Implicit flow: set session from hash tokens
          console.log('[AuthCallback] Using implicit flow (hash tokens)');
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          session = result.data.session;
          error = result.error;
        } else {
          // With detectSessionInUrl=true, Supabase can auto-complete PKCE on page load.
          // Give it a moment before attempting manual exchange.
          session = await waitForSession(8, 250);

          if (!session && code) {
            console.log('[AuthCallback] Falling back to manual PKCE exchange');
            const result = await supabase.auth.exchangeCodeForSession(code);
            session = result.data.session;
            error = result.error;

            if (error && PKCE_VERIFIER_MISSING_RE.test(error.message || "")) {
              // Recover from race where auto-detection already consumed the verifier.
              console.warn('[AuthCallback] PKCE verifier missing, retrying session recovery');
              error = null;
              verifierMissing = true;
              session = await waitForSession(8, 300);
            }
          }
        }

        console.log('[AuthCallback] Session result:', { session: !!session, error });

        if (error) {
          throw error;
        }

        if (!session && verifierMissing) {
          // A valid code without its PKCE verifier: typically the signup confirmation email
          // opened in a browser other than the one (or the app) that started the signup.
          // Supabase has already confirmed the email; ask the user to sign in where they were.
          console.warn('[AuthCallback] Code without PKCE verifier, showing the email-confirmed message');
          window.history.replaceState({}, document.title, "/auth/callback");
          setStatus("confirmed");
          return;
        }

        if (!session) {
          console.error('[AuthCallback] No session found!');
          throw new Error(NO_SESSION);
        }

        // Prevent accidental re-processing of auth params on refresh/back.
        if (window.location.search || window.location.hash) {
          window.history.replaceState({}, document.title, "/auth/callback");
        }

        console.log('[AuthCallback] Calling syncSupabaseUser mutation...');
        await syncWithBackend(session);
      } catch (error: any) {
        setStatus("error");
        const rawMessage = error?.message || "";
        if (rawMessage === NO_SESSION) {
          setErrorMessage(NO_SESSION);
        } else if (PKCE_VERIFIER_MISSING_RE.test(rawMessage)) {
          setErrorMessage(SESSION_EXPIRED);
        } else {
          setErrorMessage(authErrorMessage(error, SIGN_IN_FAILED));
        }
        console.error(error);

        // Back to the sign-in page after 3 seconds.
        redirectLater(() => navigate("/login"), 3000);
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <AppLayout className="flex items-center justify-center p-4" withShell={false}>
      <main className="w-full max-w-md text-center">
        <Wordmark />
        <div className="surface-panel mt-6 space-y-3 p-6">
          {status === "loading" && (
            <div role="status" className="space-y-3">
              <Loader2 className="mx-auto size-8 animate-spin text-action-text" aria-hidden />
              <h1 className="font-display text-[30px] font-bold leading-tight">Accesso in corso…</h1>
              <p className="text-[15px] text-muted-foreground">Stiamo completando l&apos;accesso.</p>
            </div>
          )}

          {status === "success" && (
            <div role="status" className="space-y-3">
              <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
              <h1 className="font-display text-[30px] font-bold leading-tight">Accesso completato</h1>
              <p className="text-[15px] text-muted-foreground">Un attimo, ti portiamo nell&apos;app…</p>
            </div>
          )}

          {status === "confirmed" && (
            <>
              <MailCheck className="mx-auto size-8 text-success" aria-hidden />
              <h1 className="font-display text-[30px] font-bold leading-tight">Email confermata</h1>
              <p className="text-[15px] text-muted-foreground">
                Se stavi usando l&apos;app, torna nell&apos;app e accedi.
              </p>
              <Button asChild className="w-full">
                <Link href="/login">Vai al login</Link>
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div role="alert" className="space-y-3">
                <TriangleAlert className="mx-auto size-8 text-danger" aria-hidden />
                <h1 className="font-display text-[30px] font-bold leading-tight">Accesso non riuscito</h1>
                <p className="text-[15px] text-muted-foreground">{errorMessage}</p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Vai al login</Link>
              </Button>
            </>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
