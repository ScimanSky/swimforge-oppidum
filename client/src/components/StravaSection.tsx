import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Activity, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function StravaSection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const { isAuthenticated } = useAuth();
  
  // Get Strava status
  const { data: stravaStatus, isLoading: statusLoading, refetch } = trpc.strava.status.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  
  // Get authorize URL
  const getAuthorizeUrlQuery = trpc.strava.getAuthorizeUrl.useQuery(undefined, {
    enabled: false, // Don't auto-fetch
  });
  
  // Disconnect mutation
  const disconnectMutation = trpc.strava.disconnect.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  // Sync mutation
  const syncMutation = trpc.strava.sync.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleConnectStrava = async () => {
    setIsConnecting(true);
    try {
      const result = await getAuthorizeUrlQuery.refetch();
      if (result.data) {
        // Redirect to Strava authorization page
        window.location.href = result.data;
      }
    } catch (error) {
      console.error("Error getting Strava authorize URL:", error);
      setIsConnecting(false);
    }
  };

  const handleDisconnectStrava = () => {
    if (confirm("Sei sicuro di voler disconnettere Strava?")) {
      disconnectMutation.mutate();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-6 shadow-lg border border-border mt-6"
    >
      <div className="flex items-start justify-between flex-col sm:flex-row gap-4">
        <div className="flex items-start gap-4 flex-1">
          <div className="p-3 bg-orange-500/20 rounded-xl">
            <Activity className="w-8 h-8 text-orange-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-2">
              Integrazione Strava
            </h2>
            <p className="text-muted-foreground mb-4 text-sm">
              Connetti il tuo account Strava per sincronizzare automaticamente le tue attività di nuoto
            </p>

            {/* Status */}
            {statusLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Caricamento...</span>
              </div>
            ) : stravaStatus?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="font-medium">Connesso</span>
                </div>
                {stravaStatus.displayName && (
                  <p className="text-sm text-muted-foreground">
                    Account: <span className="font-medium text-foreground">{stravaStatus.displayName}</span>
                  </p>
                )}
                {stravaStatus.lastSync && (
                  <p className="text-sm text-muted-foreground">
                    Ultima sincronizzazione: {new Date(stravaStatus.lastSync).toLocaleString("it-IT")}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="w-5 h-5" />
                <span>Non connesso</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full sm:w-auto flex flex-col gap-3">
          {stravaStatus?.connected ? (
            <>
              <button
                onClick={() => syncMutation.mutate({ daysBack: 30 })}
                disabled={syncMutation.isPending}
                className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {syncMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sincronizzazione...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Sincronizza Attività
                  </>
                )}
              </button>
              <button
                onClick={handleDisconnectStrava}
                disabled={disconnectMutation.isPending}
                className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnectMutation.isPending ? "Disconnessione..." : "Disconnetti"}
              </button>
            </>
          ) : (
            <button
              onClick={handleConnectStrava}
              disabled={isConnecting || getAuthorizeUrlQuery.isFetching}
              className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isConnecting || getAuthorizeUrlQuery.isFetching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connessione...
                </>
              ) : (
                <>
                  <Activity className="w-5 h-5" />
                  Connetti Strava
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-500/10 rounded-xl border border-blue-500/30">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          <strong>Nota:</strong> Dopo aver connesso Strava, le tue attività di nuoto verranno sincronizzate automaticamente ogni 6 ore quando effettui il login.
        </p>
      </div>
    </motion.div>
  );
}
