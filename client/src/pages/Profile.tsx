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
  Waves,
  Clock,
  Target,
  Medal,
  Trophy,
  Zap,
  LogOut,
  Settings,
  Link as LinkIcon,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import MobileNav from "@/components/MobileNav";
import GarminSection from "@/components/GarminSection";
import { toast } from "sonner";

export default function Profile() {
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: userBadges } = trpc.badges.userBadges.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: xpHistory } = trpc.xp.history.useQuery(
    { limit: 10 },
    { enabled: isAuthenticated }
  );

  const seedData = trpc.admin.seedData.useMutation({
    onSuccess: () => {
      toast.success("Dati inizializzati con successo!");
    },
    onError: () => {
      toast.error("Errore nell'inizializzazione");
    },
  });

  // Redirect if not authenticated
  if (!authLoading && !isAuthenticated) {
    setLocation("/");
    return null;
  }

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  const isLoading = authLoading || profileLoading;

  // Format helpers
  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Calculate XP progress
  const xpProgress = profile && profile.nextLevelXp
    ? ((profile.totalXp - (profile.nextLevelXp - profile.xpToNextLevel)) / profile.xpToNextLevel) * 100
    : 0;

  const reasonLabels: Record<string, string> = {
    activity: "Attività",
    badge: "Badge",
    bonus: "Bonus",
    streak: "Serie",
    record: "Record",
    level_up: "Livello",
  };

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
                  {/* Avatar */}
                  <div 
                    className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg border-4 border-white/30"
                    style={{ backgroundColor: profile?.levelColor || "#3b82f6" }}
                  >
                    {(user?.name || "N")[0].toUpperCase()}
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

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <Card>
            <CardContent className="p-4 text-center">
              <Waves className="h-6 w-6 text-[var(--azure)] mx-auto mb-2" />
              <p className="text-2xl font-bold text-card-foreground">
                {isLoading ? "..." : formatDistance(profile?.totalDistanceMeters || 0)}
              </p>
              <p className="text-xs text-muted-foreground">Distanza Totale</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Clock className="h-6 w-6 text-[var(--gold)] mx-auto mb-2" />
              <p className="text-2xl font-bold text-card-foreground">
                {isLoading ? "..." : formatTime(profile?.totalTimeSeconds || 0)}
              </p>
              <p className="text-xs text-muted-foreground">Tempo in Acqua</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Target className="h-6 w-6 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-card-foreground">
                {isLoading ? "..." : profile?.totalSessions || 0}
              </p>
              <p className="text-xs text-muted-foreground">Sessioni</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <Medal className="h-6 w-6 text-purple-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-card-foreground">
                {userBadges?.length || 0}
              </p>
              <p className="text-xs text-muted-foreground">Badge</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Open Water Stats */}
        {profile && profile.totalOpenWaterSessions > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Waves className="h-5 w-5 text-cyan-500" />
                  Acque Libere
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex justify-between">
                  <div>
                    <p className="text-2xl font-bold text-card-foreground">
                      {profile.totalOpenWaterSessions}
                    </p>
                    <p className="text-xs text-muted-foreground">Sessioni</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-card-foreground">
                      {formatDistance(profile.totalOpenWaterMeters)}
                    </p>
                    <p className="text-xs text-muted-foreground">Distanza</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* XP History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[var(--gold)]" />
                Storico XP
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {xpHistory && xpHistory.length > 0 ? (
                <div className="space-y-2">
                  {xpHistory.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          tx.reason === "badge" ? "bg-purple-500/10" :
                          tx.reason === "level_up" ? "bg-[var(--gold)]/10" :
                          "bg-[var(--azure)]/10"
                        }`}>
                          {tx.reason === "badge" ? (
                            <Medal className="h-4 w-4 text-purple-500" />
                          ) : tx.reason === "level_up" ? (
                            <Trophy className="h-4 w-4 text-[var(--gold)]" />
                          ) : (
                            <Zap className="h-4 w-4 text-[var(--azure)]" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-card-foreground">
                            {reasonLabels[tx.reason] || tx.reason}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {tx.description || "-"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {tx.amount > 0 && (
                          <p className="text-sm font-bold text-[var(--gold)]">+{tx.amount}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nessuna transazione XP ancora
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Garmin Connection */}
        <GarminSection garminConnected={profile?.garminConnected || false} />

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
              <CardContent className="pt-0">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => seedData.mutate()}
                  disabled={seedData.isPending}
                >
                  {seedData.isPending ? "Inizializzazione..." : "Inizializza Badge e Livelli"}
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
