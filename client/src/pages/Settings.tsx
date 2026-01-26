import { useState } from "react";
import { trpc } from "../lib/trpc";
import { motion } from "framer-motion";
import { Activity, CheckCircle, XCircle, Loader2, Settings as SettingsIcon } from "lucide-react";
import Layout from "../components/Layout";

export default function Settings() {
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Get Strava status
  const { data: stravaStatus, isLoading: statusLoading, refetch } = trpc.strava.status.useQuery();
  
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <SettingsIcon className="w-8 h-8" />
            Impostazioni
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Gestisci le tue integrazioni e preferenze
          </p>
        </div>

        {/* Strava Integration Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <Activity className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Integrazione Strava
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Connetti il tuo account Strava per sincronizzare automaticamente le tue attività di nuoto
                </p>

                {/* Status */}
                {statusLoading ? (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Caricamento...</span>
                  </div>
                ) : stravaStatus?.connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Connesso</span>
                    </div>
                    {stravaStatus.displayName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Account: <span className="font-medium">{stravaStatus.displayName}</span>
                      </p>
                    )}
                    {stravaStatus.lastSync && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Ultima sincronizzazione: {new Date(stravaStatus.lastSync).toLocaleString('it-IT')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                    <XCircle className="w-5 h-5" />
                    <span>Non connesso</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Button */}
            <div>
              {stravaStatus?.connected ? (
                <button
                  onClick={handleDisconnectStrava}
                  disabled={disconnectMutation.isPending}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disconnectMutation.isPending ? "Disconnessione..." : "Disconnetti"}
                </button>
              ) : (
                <button
                  onClick={handleConnectStrava}
                  disabled={isConnecting || getAuthorizeUrlQuery.isFetching}
                  className="px-6 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isConnecting || getAuthorizeUrlQuery.isFetching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Connessione...
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      Connetti Strava
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Nota:</strong> Dopo aver connesso Strava, le tue attività di nuoto verranno sincronizzate automaticamente ogni 6 ore quando effettui il login.
            </p>
          </div>
        </motion.div>

        {/* Future sections can be added here */}
        {/* Example: Notifications, Privacy, Account */}
      </div>
    </Layout>
  );
}
