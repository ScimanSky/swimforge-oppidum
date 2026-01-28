import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { motion } from "framer-motion";
import { Activity, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";

export default function StravaConnect() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const exchangeTokenMutation = trpc.strava.exchangeToken.useMutation({
    onSuccess: () => {
      setStatus("success");
      setMessage("Account Strava connesso con successo!");
      setTimeout(() => navigate("/dashboard"), 2000);
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
    <AppLayout showBubbles={true} bubbleIntensity="low" className="flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[oklch(0.15_0.03_220_/_0.7)] backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-[oklch(0.25_0.05_220)] shadow-2xl"
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {status === "loading" && (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-16 h-16 text-orange-500" />
            </motion.div>
          )}
          {status === "success" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <CheckCircle className="w-16 h-16 text-green-500" />
            </motion.div>
          )}
          {status === "error" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <XCircle className="w-16 h-16 text-red-500" />
            </motion.div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white text-center mb-4">
          {status === "loading" && "Connessione a Strava..."}
          {status === "success" && "Connesso!"}
          {status === "error" && "Errore"}
        </h1>

        {/* Message */}
        <p className="text-gray-300 text-center mb-6">{message}</p>

        {/* Strava Logo */}
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <Activity className="w-5 h-5 text-orange-500" />
          <span>Powered by Strava</span>
        </div>

        {/* Error Actions */}
        {status === "error" && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate("/settings")}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition"
            >
              Impostazioni
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition"
            >
              Dashboard
            </button>
          </div>
        )}
      </motion.div>
    </AppLayout>
  );
}
