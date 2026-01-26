import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Activity, CheckCircle, XCircle, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export function StravaSection() {
  const utils = trpc.useUtils();
  const [isConnecting, setIsConnecting] = useState(false);

  // Get Strava status
  const { data: stravaStatus, isLoading: statusLoading } = trpc.strava.status.useQuery();

  // Get authorize URL mutation
  const getAuthorizeUrlMutation = trpc.strava.getAuthorizeUrl.useMutation();

  // Disconnect mutation
  const disconnectMutation = trpc.strava.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Account Strava disconnesso con successo!");
      utils.strava.status.invalidate();
    },
    onError: (error) => {
      toast.error("Errore nella disconnessione: " + error.message);
    },
  });

  // Sync mutation
  const syncMutation = trpc.strava.sync.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Sincronizzate ${data.count} attività da Strava!`);
        utils.activities.list.invalidate();
        utils.profile.get.invalidate();
        utils.strava.status.invalidate();
      } else {
        toast.error(data.error || "Errore nella sincronizzazione");
      }
    },
    onError: (error) => {
      toast.error("Errore nella sincronizzazione: " + error.message);
    },
  });

  const handleConnectStrava = async () => {
    try {
      setIsConnecting(true);
      const result = await getAuthorizeUrlMutation.mutateAsync();
      if (result?.authorizeUrl) {
        window.location.href = result.authorizeUrl;
      } else {
        toast.error("Errore nella generazione dell'URL di autorizzazione");
        setIsConnecting(false);
      }
    } catch (error) {
      toast.error("Errore nella connessione a Strava");
      setIsConnecting(false);
    }
  };

  const handleDisconnectStrava = () => {
    if (confirm("Sei sicuro di voler disconnettere il tuo account Strava?")) {
      disconnectMutation.mutate();
    }
  };

  const isConnected = stravaStatus?.connected || false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isConnected ? "bg-green-500/10" : "bg-orange-500/10"
              }`}>
                <Activity className={`h-5 w-5 ${
                  isConnected ? "text-green-500" : "text-orange-500"
                }`} />
              </div>
              <div>
                <p className="font-medium text-card-foreground">Strava</p>
                <p className="text-xs text-muted-foreground">
                  {isConnected 
                    ? `Collegato${stravaStatus?.displayName ? ` (${stravaStatus.displayName})` : ""}`
                    : "Non collegato"
                  }
                </p>
                {isConnected && stravaStatus?.lastSync && (
                  <p className="text-xs text-muted-foreground">
                    Ultimo sync: {new Date(stravaStatus.lastSync).toLocaleDateString("it-IT")}
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
                    title="Sincronizza attività"
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
                    onClick={handleDisconnectStrava}
                    disabled={disconnectMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    title="Scollega Strava"
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleConnectStrava}
                  disabled={isConnecting || getAuthorizeUrlMutation.isPending}
                >
                  {isConnecting || getAuthorizeUrlMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Collega"
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
