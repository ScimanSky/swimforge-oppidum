import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/AppLayout";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <AppLayout showBubbles={true} bubbleIntensity="low" className="flex items-center justify-center p-4">
      <Card className="w-full max-w-lg mx-4 shadow-2xl border border-[oklch(0.25_0.05_220)] bg-[oklch(0.15_0.03_220_/_0.7)] backdrop-blur-lg">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse" />
              <AlertCircle className="relative h-16 w-16 text-red-400" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-2">404</h1>

          <h2 className="text-xl font-semibold text-[oklch(0.75_0.04_220)] mb-4">
            Pagina non trovata
          </h2>

          <p className="text-[oklch(0.65_0.03_220)] mb-8 leading-relaxed">
            La pagina che cerchi non esiste o è stata spostata.
          </p>

          <div
            id="not-found-button-group"
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoHome}
              className="bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] text-white px-6 py-2.5 rounded-lg transition-all duration-200 shadow-lg hover:opacity-90"
            >
              <Home className="w-4 h-4 mr-2" />
              Torna alla home
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
