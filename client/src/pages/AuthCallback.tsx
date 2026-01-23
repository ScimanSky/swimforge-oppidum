import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Waves, Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const syncSupabaseUserMutation = trpc.auth.syncSupabaseUser.useMutation({
    onSuccess: () => {
      setStatus("success");
      toast.success("Accesso effettuato con successo!");
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    },
    onError: (error) => {
      setStatus("error");
      setErrorMessage(error.message || "Errore durante la sincronizzazione");
      toast.error("Errore durante l'accesso");
    },
  });

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('[AuthCallback] Starting auth callback...');
        
        // Parse hash fragment and exchange for session
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        console.log('[AuthCallback] Hash params:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });
        
        if (!accessToken) {
          throw new Error("Nessun access token trovato nell'URL");
        }
        
        // Set the session with the tokens from the hash
        const { data: { session }, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });
        
        console.log('[AuthCallback] Session result:', { session: !!session, error });

        if (error) {
          throw error;
        }

        if (!session) {
          console.error('[AuthCallback] No session found!');
          throw new Error("Nessuna sessione trovata");
        }

        // Sincronizza l'utente con il backend
        console.log('[AuthCallback] Syncing user with backend:', {
          userId: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name
        });
        
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
        setErrorMessage(error.message || "Errore durante l'autenticazione");
        toast.error("Errore durante l'accesso con Google");
        console.error(error);
        
        // Redirect alla pagina di login dopo 3 secondi
        setTimeout(() => {
          navigate("/auth");
        }, 3000);
      }
    };

    handleAuthCallback();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
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
  );
}
