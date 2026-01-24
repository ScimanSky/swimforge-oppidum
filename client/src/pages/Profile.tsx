import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import {
  User,
  ChevronLeft,
  LogOut,
  Settings,
} from "lucide-react";
import { useLocation, Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import GarminSection from "@/components/GarminSection";
import { toast } from "sonner";
import { useEffect } from "react";

export default function Profile() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const recalculateBadges = trpc.badges.recalculate.useMutation({
    onSuccess: (data) => {
      if (data.newBadges > 0) {
        toast.success(`${data.newBadges} nuovi badge sbloccati!`);
        // Refresh profile and badges
        utils.profile.get.invalidate();
        utils.badges.progress.invalidate();
        utils.badges.userBadges.invalidate();
      } else {
        toast.success("Tutti i badge sono aggiornati!");
      }
    },
    onError: () => {
      toast.error("Errore nel ricalcolo badge");
    },
  });

  const initializeProfileBadges = trpc.badges.initializeProfileBadges.useMutation({
    onSuccess: (data) => {
      toast.success(`Badge profilo inizializzati per ${data.updated} utenti!`);
      utils.profile.get.invalidate();
    },
    onError: () => {
      toast.error("Errore nell'inizializzazione badge profilo");
    },
  });

  const recalculateChallengesProgress = trpc.challenges.recalculateAllProgress.useMutation({
    onSuccess: (data) => {
      toast.success(`Progresso ricalcolato per ${data.updated} sfide attive!`);
    },
    onError: () => {
      toast.error("Errore nel ricalcolo progresso sfide");
    },
  });

  const seedData = trpc.admin.seedData.useMutation({
    onSuccess: () => {
      toast.success("Dati inizializzati con successo!");
    },
    onError: () => {
      toast.error("Errore nell'inizializzazione");
    },
  });

  // Redirect if not authenticated - use Redirect component instead of setLocation during render
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const isLoading = authLoading || profileLoading;



  // Calculate XP progress
  const xpProgress = profile && profile.nextLevelXp
    ? ((profile.totalXp - (profile.nextLevelXp - profile.xpToNextLevel)) / profile.xpToNextLevel) * 100
    : 0;



  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-white">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <ChevronLeft className="h-5 w-5" />
                </Button>
              </Link>
              <h1 className="font-semibold text-lg">Profilo</h1>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-[var(--navy)] to-[var(--azure)] p-6 text-white">
              {isLoading ? (
                <div className="flex items-center gap-4">
                  <Skeleton className="w-20 h-20 rounded-full bg-white/20" />
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32 bg-white/20" />
                    <Skeleton className="h-4 w-48 bg-white/20" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  {/* Profile Badge */}
                  <div className="w-20 h-20 flex items-center justify-center shadow-lg">
                    {profile?.profileBadge?.badge_image_url ? (
                      <img 
                        src={profile.profileBadge.badge_image_url} 
                        alt={profile.profileBadge.name}
                        className="w-full h-full object-contain drop-shadow-2xl"
                      />
                    ) : (
                      <div 
                        className="w-full h-full rounded-full flex items-center justify-center text-3xl font-bold border-4 border-white/30"
                        style={{ backgroundColor: profile?.levelColor || "#3b82f6" }}
                      >
                        {(user?.name || "N")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold">{user?.name || "Nuotatore"}</h2>
                    <p className="text-white/70 text-sm">{user?.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span 
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: profile?.levelColor || "#3b82f6" }}
                      >
                        Lv. {profile?.level || 1}
                      </span>
                      <span className="text-white/80 text-sm">{profile?.levelTitle || "Novizio"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <CardContent className="p-4">
              {/* XP Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progresso Livello</span>
                  <span className="font-semibold text-[var(--gold)]">
                    {profile?.totalXp?.toLocaleString() || 0} XP
                  </span>
                </div>
                <Progress value={xpProgress} className="h-2" />
                {profile?.nextLevelXp && (
                  <p className="text-xs text-muted-foreground text-right">
                    {profile.xpToNextLevel.toLocaleString()} XP al livello {profile.level + 1}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>







        {/* Garmin Connection */}
        <GarminSection garminConnected={profile?.garminConnected || false} />

        {/* Badge Recalculation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Ricalcola Badge
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-3">
                Se hai notato badge mancanti, usa questo pulsante per ricalcolare tutti i badge in base alle tue statistiche attuali.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => recalculateBadges.mutate()}
                disabled={recalculateBadges.isPending}
              >
                {recalculateBadges.isPending ? "Ricalcolo..." : "Ricalcola Badge"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Admin Section */}
        {user?.role === "admin" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="border-orange-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-orange-500">
                  <Settings className="h-5 w-5" />
                  Amministrazione
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => seedData.mutate()}
                  disabled={seedData.isPending}
                >
                  {seedData.isPending ? "Inizializzazione..." : "Inizializza Badge e Livelli"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => initializeProfileBadges.mutate()}
                  disabled={initializeProfileBadges.isPending}
                >
                  {initializeProfileBadges.isPending ? "Inizializzazione..." : "Inizializza Badge Profilo"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => recalculateChallengesProgress.mutate()}
                  disabled={recalculateChallengesProgress.isPending}
                >
                  {recalculateChallengesProgress.isPending ? "Ricalcolo..." : "Ricalcola Progresso Sfide"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Logout Button */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Esci
        </Button>
      </main>

      <MobileNav />
    </div>
  );
}
