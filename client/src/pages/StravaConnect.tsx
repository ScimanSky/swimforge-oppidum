import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Activity, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { trpc } from "../lib/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Wordmark } from "@/components/corsia/Wordmark";
import { Button } from "@/components/ui/button";

/** `/strava/callback`: return from the Strava authorisation. A public page: its state is the page's h1. */
export default function StravaConnect() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const exchangeTokenMutation = trpc.strava.exchangeToken.useMutation({
    onSuccess: () => {
      setStatus("success");
      setMessage("Account Strava connesso con successo!");
      setTimeout(() => navigate("/home"), 2000);
    },
    onError: (error) => {
      setStatus("error");
      setMessage(error.message || "Errore durante la connessione a Strava");
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setMessage("Autorizzazione Strava negata");
      return;
    }

    if (code) {
      exchangeTokenMutation.mutate({ code });
    } else {
      setStatus("error");
      setMessage("Codice di autorizzazione mancante");
    }
  }, []);

  return (
    <AppLayout className="flex items-center justify-center p-4" withShell={false}>
      <main className="w-full max-w-md text-center">
        <Wordmark />
        <div className="surface-panel mt-6 space-y-3 p-6">
          {/* Keyed by state: each state is a fresh live region, so it is announced. */}
          <div key={status} role={status === "error" ? "alert" : "status"} className="space-y-3">
            {status === "loading" && (
              <Loader2 className="mx-auto size-8 animate-spin text-action-text" aria-hidden />
            )}
            {status === "success" && <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />}
            {status === "error" && <TriangleAlert className="mx-auto size-8 text-danger" aria-hidden />}
            <h1 className="font-display text-[30px] font-bold leading-tight">
              {status === "loading" && "Connessione a Strava..."}
              {status === "success" && "Connesso!"}
              {status === "error" && "Errore"}
            </h1>
            {message ? <p className="text-[15px] text-muted-foreground">{message}</p> : null}
          </div>

          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-5" aria-hidden />
            <span>Powered by Strava</span>
          </p>

          {status === "error" && (
            <div className="flex gap-3 pt-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/settings")}>
                Impostazioni
              </Button>
              <Button className="flex-1" onClick={() => navigate("/home")}>
                Home
              </Button>
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
