import { useId, useState, type Ref } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LoadError } from "@/components/corsia/LoadState";
import { Link as LinkIcon, RefreshCw, Unlink, Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";
import GarminSyncCountPicker from "@/components/GarminSyncCountPicker";
import { formatSessionDate } from "@/lib/format";
import { garminSyncButtonLabel, useGarminSyncCount } from "@/lib/garmin-sync-count";
import { errorToastMessage } from "@/lib/trpc-errors";

interface GarminSectionProps {
  garminConnected: boolean;
  /** The card's title, focusable from code (Settings moves the focus here from the list above). */
  headingRef?: Ref<HTMLHeadingElement>;
}

type AuthStep = "credentials" | "mfa";

function formatGarminErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  const secondsMatch = normalized.match(/attendi\s+(\d+)\s+secondi/);
  if (secondsMatch?.[1]) {
    const seconds = Number(secondsMatch[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      return `Garmin sta limitando temporaneamente i tentativi di accesso. Riprova tra circa ${minutes} minuti con un solo tentativo.`;
    }
  }
  if (
    normalized.includes("429") ||
    normalized.includes("too many requests") ||
    normalized.includes("troppi tentativi") ||
    normalized.includes("rate limit") ||
    normalized.includes("limitando temporaneamente") ||
    normalized.includes("temporaneamente limitato")
  ) {
    return "Garmin sta limitando temporaneamente i tentativi di accesso. Attendi 10-15 minuti e riprova con un solo tentativo.";
  }
  return message;
}

/**
 * Garmin Connect in Impostazioni › Connessioni: state of the link, connect (with the MFA code
 * step), disconnect, and the sync of the last 1/5/10 swims.
 */
export default function GarminSection({ garminConnected, headingRef }: GarminSectionProps) {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");
  const [syncCount, setSyncCount] = useGarminSyncCount();
  const titleId = useId();

  const utils = trpc.useUtils();

  const statusQuery = trpc.garmin.status.useQuery();
  const garminStatus = statusQuery.data;

  const connectMutation = trpc.garmin.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Garmin Connect collegato con successo!");
        resetDialog();
        utils.garmin.status.invalidate();
        utils.profile.get.invalidate();
      } else if (data.mfaRequired) {
        // MFA required - switch to MFA step
        setAuthStep("mfa");
        toast.info("Controlla la tua email per il codice di verifica");
      } else {
        toast.error(formatGarminErrorMessage(data.error || "Errore nel collegamento"));
      }
    },
    onError: (error) => {
      toast.error(formatGarminErrorMessage(errorToastMessage(error, "Collegamento a Garmin non riuscito.")));
    },
  });

  const mfaMutation = trpc.garmin.completeMfa.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Garmin Connect collegato con successo!");
        resetDialog();
        utils.garmin.status.invalidate();
        utils.profile.get.invalidate();
      } else {
        toast.error(formatGarminErrorMessage(data.error || "Codice MFA non valido"));
      }
    },
    onError: (error) => {
      toast.error(formatGarminErrorMessage(errorToastMessage(error, "Verifica del codice non riuscita.")));
    },
  });

  const disconnectMutation = trpc.garmin.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Garmin Connect scollegato");
      utils.garmin.status.invalidate();
      utils.profile.get.invalidate();
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Errore nello scollegamento"));
    },
  });

  const syncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        if (data.synced === 0) {
          toast.info("Nessuna nuova nuotata da sincronizzare");
        } else {
          toast.success(`${data.synced} attività sincronizzate!`);
        }
        if (Array.isArray(data.detectedPbs) && data.detectedPbs.length > 0) {
          toast.success(`Nuovi PB rilevati: ${data.detectedPbs.length}`);
        }
        utils.activities.list.invalidate();
        utils.profile.get.invalidate();
      }
    },
    onError: (error) => {
      toast.error(errorToastMessage(error, "Sincronizzazione non riuscita."));
    },
  });

  const resetDialog = () => {
    setIsConnectDialogOpen(false);
    setEmail("");
    setPassword("");
    setMfaCode("");
    setAuthStep("credentials");
  };

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Inserisci email e password");
      return;
    }
    connectMutation.mutate({ email, password });
  };

  const handleMfaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaCode) {
      toast.error("Inserisci il codice di verifica");
      return;
    }
    mfaMutation.mutate({ mfaCode, email });
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      resetDialog();
    }
    setIsConnectDialogOpen(open);
  };

  const isConnected = garminStatus?.connected || garminConnected;
  const isLoading = connectMutation.isPending || mfaMutation.isPending;
  // Not known yet (or unknown after an error): never offer «Collega» to someone who may be linked.
  const statusUnknown = !isConnected && !garminStatus;

  return (
    <section aria-labelledby={titleId} className="surface-panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              isConnected ? "bg-success/15 text-success" : "bg-raised text-muted-foreground"
            }`}
          >
            <LinkIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} ref={headingRef} tabIndex={-1} className="text-[17px] font-bold outline-none">
              Garmin Connect
            </h2>
            {statusUnknown ? null : (
              <p className="break-words text-sm text-muted-foreground">
                {isConnected
                  ? `Collegato${garminStatus?.email ? ` come ${garminStatus.email}` : ""}`
                  : "Non collegato"}
              </p>
            )}
            {isConnected && garminStatus?.lastSync ? (
              <p className="text-sm text-muted-foreground">
                Ultima sincronizzazione: {formatSessionDate(garminStatus.lastSync)}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {statusUnknown ? null : isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
              className="text-danger"
            >
              <Unlink aria-hidden />
              Scollega
            </Button>
          ) : (
            <Dialog open={isConnectDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button size="sm">Collega</Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl bg-card shadow-none">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-[17px] font-bold">
                    {authStep === "credentials" ? (
                      <>
                        <LinkIcon className="size-5 text-action-text" aria-hidden />
                        Collega Garmin Connect
                      </>
                    ) : (
                      <>
                        <KeyRound className="size-5 text-action-text" aria-hidden />
                        Verifica il codice
                      </>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {authStep === "credentials"
                      ? "Inserisci le credenziali del tuo account Garmin Connect per sincronizzare automaticamente le tue attività di nuoto."
                      : "Abbiamo inviato un codice di verifica alla tua email. Inseriscilo qui sotto per completare il collegamento."}
                  </DialogDescription>
                </DialogHeader>

                {authStep === "credentials" ? (
                  <form onSubmit={handleConnect} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="garmin-email">Email Garmin</Label>
                      <Input
                        id="garmin-email"
                        type="email"
                        inputMode="email"
                        placeholder="email@esempio.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="garmin-password">Password Garmin</Label>
                      <Input
                        id="garmin-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                      />
                    </div>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>Le tue credenziali sono crittografate e utilizzate solo per sincronizzare le attività.</p>
                      <p className="flex items-start gap-2">
                        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
                        Se hai la verifica in due passaggi, riceverai un codice via email nel passaggio successivo.
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="animate-spin" aria-hidden />
                          Collegamento…
                        </>
                      ) : (
                        "Collega account"
                      )}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleMfaSubmit} className="space-y-4">
                    <p className="flex items-center gap-2 rounded-xl bg-raised p-3 text-sm">
                      <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>
                        Controlla la tua email <span className="font-semibold">{email}</span>
                      </span>
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="mfa-code">Codice di verifica</Label>
                      <Input
                        id="mfa-code"
                        type="text"
                        inputMode="numeric"
                        placeholder="123456"
                        value={mfaCode}
                        onChange={(e) => setMfaCode(e.target.value)}
                        maxLength={10}
                        className="text-center font-mono text-2xl tracking-widest tabular-nums"
                        autoComplete="one-time-code"
                        aria-describedby="mfa-code-hint"
                        autoFocus
                        required
                      />
                      <p id="mfa-code-hint" className="text-sm text-muted-foreground">
                        Inserisci il codice a 6 cifre ricevuto via email da Garmin.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setAuthStep("credentials")}
                        disabled={isLoading}
                      >
                        Indietro
                      </Button>
                      <Button type="submit" className="flex-1" disabled={isLoading || mfaCode.length < 4}>
                        {isLoading ? (
                          <>
                            <Loader2 className="animate-spin" aria-hidden />
                            Verifica…
                          </>
                        ) : (
                          "Verifica codice"
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {statusUnknown && statusQuery.isError ? (
        <LoadError variant="inline" className="mt-3" onRetry={() => void statusQuery.refetch()} />
      ) : statusUnknown ? (
        <div role="status" className="mt-3">
          <span className="sr-only">Caricamento dello stato di Garmin…</span>
          <Skeleton className="h-4 w-40" aria-hidden />
        </div>
      ) : null}

      {isConnected && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <GarminSyncCountPicker
            value={syncCount}
            onChange={setSyncCount}
            disabled={syncMutation.isPending}
          />
          <Button
            onClick={() => syncMutation.mutate({ daysBack: 30, maxActivities: syncCount })}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            {syncMutation.isPending ? "Sincronizzazione…" : garminSyncButtonLabel(syncCount)}
          </Button>
        </div>
      )}
    </section>
  );
}
