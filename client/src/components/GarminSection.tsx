import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { motion } from "framer-motion";
import { Link as LinkIcon, RefreshCw, Unlink, Loader2, Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";

interface GarminSectionProps {
  garminConnected: boolean;
}

type AuthStep = "credentials" | "mfa";

export default function GarminSection({ garminConnected }: GarminSectionProps) {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [authStep, setAuthStep] = useState<AuthStep>("credentials");

  const utils = trpc.useUtils();

  const { data: garminStatus } = trpc.garmin.status.useQuery();

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
        toast.error(data.error || "Errore nel collegamento");
      }
    },
    onError: (error) => {
      toast.error("Errore: " + error.message);
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
        toast.error(data.error || "Codice MFA non valido");
      }
    },
    onError: (error) => {
      toast.error("Errore: " + error.message);
    },
  });

  const disconnectMutation = trpc.garmin.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Garmin Connect scollegato");
      utils.garmin.status.invalidate();
      utils.profile.get.invalidate();
    },
    onError: () => {
      toast.error("Errore nello scollegamento");
    },
  });

  const syncMutation = trpc.garmin.sync.useMutation({
    onSuccess: (data) => {
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.synced} attività sincronizzate!`);
        utils.activities.list.invalidate();
        utils.profile.get.invalidate();
      }
    },
    onError: (error) => {
      toast.error("Errore nella sincronizzazione: " + error.message);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isConnected ? "bg-green-500/10" : "bg-orange-500/10"
              }`}>
                <LinkIcon className={`h-5 w-5 ${
                  isConnected ? "text-green-500" : "text-orange-500"
                }`} />
              </div>
              <div>
                <p className="font-medium text-card-foreground">Garmin Connect</p>
                <p className="text-xs text-muted-foreground">
                  {isConnected 
                    ? `Collegato${garminStatus?.email ? ` (${garminStatus.email})` : ""}`
                    : "Non collegato"
                  }
                </p>
                {isConnected && garminStatus?.lastSync && (
                  <p className="text-xs text-muted-foreground">
                    Ultimo sync: {new Date(garminStatus.lastSync).toLocaleDateString("it-IT")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {isConnected ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => syncMutation.mutate({ daysBack: 30 })}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Dialog open={isConnectDialogOpen} onOpenChange={handleDialogClose}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Collega
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        {authStep === "credentials" ? (
                          <>
                            <LinkIcon className="h-5 w-5" />
                            Collega Garmin Connect
                          </>
                        ) : (
                          <>
                            <KeyRound className="h-5 w-5" />
                            Verifica Codice MFA
                          </>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        {authStep === "credentials" 
                          ? "Inserisci le credenziali del tuo account Garmin Connect per sincronizzare automaticamente le tue attività di nuoto."
                          : "Abbiamo inviato un codice di verifica alla tua email. Inseriscilo qui sotto per completare il collegamento."
                        }
                      </DialogDescription>
                    </DialogHeader>

                    {authStep === "credentials" ? (
                      <form onSubmit={handleConnect} className="space-y-4 mt-4">
                        <div className="space-y-2">
                          <Label htmlFor="garmin-email">Email Garmin</Label>
                          <Input
                            id="garmin-email"
                            type="email"
                            placeholder="email@esempio.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="garmin-password">Password</Label>
                          <Input
                            id="garmin-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                        </div>
                        <div className="text-xs text-muted-foreground space-y-2">
                          <p>
                            Le tue credenziali sono crittografate e utilizzate solo per sincronizzare le attività.
                          </p>
                          <p className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            Se hai MFA attivo, riceverai un codice via email nel passaggio successivo.
                          </p>
                        </div>
                        <Button
                          type="submit"
                          className="w-full bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Collegamento...
                            </>
                          ) : (
                            "Collega Account"
                          )}
                        </Button>
                      </form>
                    ) : (
                      <form onSubmit={handleMfaSubmit} className="space-y-4 mt-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <p className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Controlla la tua email <strong>{email}</strong>
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mfa-code">Codice di Verifica</Label>
                          <Input
                            id="mfa-code"
                            type="text"
                            placeholder="123456"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value)}
                            maxLength={10}
                            className="text-center text-2xl tracking-widest font-mono"
                            autoFocus
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Inserisci il codice a 6 cifre ricevuto via email da Garmin
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
                          <Button
                            type="submit"
                            className="flex-1 bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                            disabled={isLoading || mfaCode.length < 4}
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Verifica...
                              </>
                            ) : (
                              "Verifica Codice"
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
        </CardContent>
      </Card>
    </motion.div>
  );
}
