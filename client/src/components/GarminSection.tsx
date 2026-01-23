import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Link as LinkIcon, RefreshCw, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GarminSectionProps {
  garminConnected: boolean;
}

export default function GarminSection({ garminConnected }: GarminSectionProps) {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const utils = trpc.useUtils();

  const { data: garminStatus } = trpc.garmin.status.useQuery();

  const connectMutation = trpc.garmin.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Garmin Connect collegato con successo!");
        setIsConnectDialogOpen(false);
        setEmail("");
        setPassword("");
        utils.garmin.status.invalidate();
        utils.profile.get.invalidate();
      } else {
        toast.error(data.error || "Errore nel collegamento");
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

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Inserisci email e password");
      return;
    }
    connectMutation.mutate({ email, password });
  };

  const isConnected = garminStatus?.connected || garminConnected;

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
                <Dialog open={isConnectDialogOpen} onOpenChange={setIsConnectDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      Collega
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Collega Garmin Connect</DialogTitle>
                      <DialogDescription>
                        Inserisci le credenziali del tuo account Garmin Connect per sincronizzare automaticamente le tue attività di nuoto.
                      </DialogDescription>
                    </DialogHeader>
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
                      <p className="text-xs text-muted-foreground">
                        Le tue credenziali sono crittografate e utilizzate solo per sincronizzare le attività.
                      </p>
                      <Button
                        type="submit"
                        className="w-full bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                        disabled={connectMutation.isPending}
                      >
                        {connectMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Collegamento...
                          </>
                        ) : (
                          "Collega Account"
                        )}
                      </Button>
                    </form>
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
