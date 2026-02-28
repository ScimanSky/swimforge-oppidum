import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Waves, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

const PKCE_VERIFIER_MISSING_RE = /pkce code verifier not found|code verifier/i;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const syncSupabaseUserMutation = trpc.auth.syncSupabaseUser.useMutation({
    onSuccess: (data) => {
      console.log('[AuthCallback] syncSupabaseUser SUCCESS:', data);
      setStatus("success");
      toast.success("Accesso effettuato con successo!");
      setTimeout(() => {
        const target = data?.isNewUser ? "/settings?tab=profile&onboarding=1" : "/home";
        console.log('[AuthCallback] Redirecting to:', target);
        window.location.href = target;
      }, 1000);
    },
    onError: (error) => {
      console.error('[AuthCallback] syncSupabaseUser ERROR:', error);
      setStatus("error");
      setErrorMessage(error.message || "Errore durante la sincronizzazione");
      toast.error("Errore durante l'accesso");
    },
  });

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
        console.log('[AuthCallback] Full URL:', window.location.href);

        let session = null;
        let error = null;

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
              session = await waitForSession(8, 300);
            }
          }
        }

        console.log('[AuthCallback] Session result:', { session: !!session, error });

        if (error) {
          throw error;
        }

        if (!session) {
          console.error('[AuthCallback] No session found!');
          throw new Error("Sessione OAuth non trovata. Riprova il login con Google.");
        }

        // Prevent accidental re-processing of auth params on refresh/back.
        if (window.location.search || window.location.hash) {
          window.history.replaceState({}, document.title, "/auth/callback");
        }

        // Sincronizza l'utente con il backend
        console.log('[AuthCallback] Syncing user with backend:', {
          userId: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name
        });
        
        console.log('[AuthCallback] Calling syncSupabaseUser mutation...');
        syncSupabaseUserMutation.mutate({
          accessToken: session.access_token,
          user: {
            id: session.user.id,
            email: session.user.email!,
            name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
          },
        });
      } catch (error: any) {
        setStatus("error");
        const rawMessage = error?.message || "Errore durante l'autenticazione";
        if (PKCE_VERIFIER_MISSING_RE.test(rawMessage)) {
          setErrorMessage("Sessione OAuth scaduta o non valida. Riprova ad accedere con Google.");
        } else {
          setErrorMessage(rawMessage);
        }
        toast.error("Errore durante l'accesso con Google");
        console.error(error);
        
        // Redirect alla pagina di login dopo 3 secondi
        setTimeout(() => {
          navigate("/login");
        }, 3000);
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low" className="flex items-center justify-center p-4" withShell={false}>
      <div className="relative w-full max-w-md">
        {/* Local glow accents */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-10 -left-10 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-12 -right-12 w-52 h-52 bg-cyan-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 text-center space-y-6">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full flex items-center justify-center">
            <Waves className="w-10 h-10 text-white" />
          </div>

        {status === "loading" && (
          <>
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              <h2 className="text-2xl font-bold text-white">Accesso in corso...</h2>
            </div>
            <p className="text-slate-400">Stiamo completando l'autenticazione con Google</p>
          </>
        )}

        {status === "success" && (
          <>
            <h2 className="text-2xl font-bold text-green-400">✓ Accesso completato!</h2>
            <p className="text-slate-400">Reindirizzamento alla dashboard...</p>
          </>
        )}

        {status === "error" && (
          <>
            <h2 className="text-2xl font-bold text-red-400">✗ Errore</h2>
            <p className="text-slate-400">{errorMessage}</p>
            <p className="text-slate-500 text-sm">Reindirizzamento alla pagina di login...</p>
          </>
        )}
        </div>
      </div>
    </AppLayout>
  );
}
