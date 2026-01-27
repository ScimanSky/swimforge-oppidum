import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { Activity, CheckCircle, XCircle, Loader2, Settings as SettingsIcon, ChevronLeft } from "lucide-react";
import { useLocation, Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { AppLayout } from "@/components/AppLayout";

export default function Settings() {
  const [isConnecting, setIsConnecting] = useState(false);
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
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

  // Redirect if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low">
    <div className="pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <button className="p-2 hover:bg-white/10 rounded-lg transition">
                <ChevronLeft className="w-6 h-6" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                <SettingsIcon className="w-7 h-7" />
                Impostazioni
              </h1>
              <p className="text-sm text-white/70 mt-1">
                Gestisci le tue integrazioni
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 pt-6">
        {/* Strava Integration Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl p-6 shadow-lg border border-border"
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
                        Ultima sincronizzazione: {new Date(stravaStatus.lastSync).toLocaleString('it-IT')}
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

            {/* Action Button */}
            <div className="w-full sm:w-auto">
              {stravaStatus?.connected ? (
                <button
                  onClick={handleDisconnectStrava}
                  disabled={disconnectMutation.isPending}
                  className="w-full sm:w-auto px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disconnectMutation.isPending ? "Disconnessione..." : "Disconnetti"}
                </button>
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
      </div>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
    </AppLayout>
  );
}
