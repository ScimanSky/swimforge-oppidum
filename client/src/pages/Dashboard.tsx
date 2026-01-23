import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getLoginUrl } from "@/const";
import { motion } from "framer-motion";
import {
  Trophy,
  Waves,
  Clock,
  Target,
  Medal,
  TrendingUp,
  ChevronRight,
  Zap,
  Calendar,
  Activity,
  Award,
  Users,
  Home,
  User,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import MobileNav from "@/components/MobileNav";

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = trpc.profile.get.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: recentBadges, isLoading: badgesLoading } = trpc.badges.userBadges.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: activities, isLoading: activitiesLoading } = trpc.activities.list.useQuery(
    { limit: 3, offset: 0 },
    { enabled: isAuthenticated }
  );

  // Redirect to home if not authenticated
  if (!authLoading && !isAuthenticated) {
    setLocation("/");
    return null;
  }

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
    });
  };

  // Calculate XP progress percentage
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
              <img src="/oppidum-logo.png" alt="Oppidum" className="h-8 w-auto" />
              <span className="font-semibold text-lg">SwimForge</span>
            </div>
            <Link href="/profile">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <User className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Welcome & Level Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-br from-[var(--navy)] via-[var(--navy-light)] to-[var(--azure)] p-6 text-white">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-6 w-32 bg-white/20" />
                  <Skeleton className="h-8 w-48 bg-white/20" />
                </div>
              ) : (
                <>
                  <p className="text-white/80 text-sm">Bentornato,</p>
                  <h1 className="text-2xl font-bold mb-4">{user?.name || "Nuotatore"}</h1>
                  
                  {/* Level Badge */}
                  <div className="flex items-center gap-4 mb-4">
                    <div 
                      className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg"
                      style={{ backgroundColor: profile?.levelColor || "#3b82f6" }}
                    >
                      {profile?.level || 1}
                    </div>
                    <div>
                      <p className="text-white/80 text-sm">Livello</p>
                      <p className="text-xl font-semibold">{profile?.levelTitle || "Novizio"}</p>
                    </div>
                  </div>

                  {/* XP Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/80">XP Totali</span>
                      <span className="font-semibold">{profile?.totalXp?.toLocaleString() || 0} XP</span>
                    </div>
                    <div className="relative h-3 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-[var(--gold)] rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(xpProgress, 100)}%` }}
                        transition={{ duration: 1, delay: 0.3 }}
                      />
                    </div>
                    {profile?.nextLevelXp && (
                      <p className="text-xs text-white/60 text-right">
                        {profile.xpToNextLevel.toLocaleString()} XP al prossimo livello
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            {
              icon: Waves,
              label: "Distanza",
              value: isLoading ? "..." : formatDistance(profile?.totalDistanceMeters || 0),
              color: "text-[var(--azure)]",
              bgColor: "bg-[var(--azure)]/10",
            },
            {
              icon: Clock,
              label: "Tempo",
              value: isLoading ? "..." : formatTime(profile?.totalTimeSeconds || 0),
              color: "text-[var(--gold)]",
              bgColor: "bg-[var(--gold)]/10",
            },
            {
              icon: Target,
              label: "Sessioni",
              value: isLoading ? "..." : profile?.totalSessions?.toString() || "0",
              color: "text-green-500",
              bgColor: "bg-green-500/10",
            },
          ].map((stat, index) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-4 text-center">
                <div className={`w-10 h-10 rounded-full ${stat.bgColor} flex items-center justify-center mx-auto mb-2`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <p className="text-lg font-bold text-card-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>

        {/* Recent Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Medal className="h-5 w-5 text-[var(--gold)]" />
                  Badge Recenti
                </CardTitle>
                <Link href="/badges">
                  <Button variant="ghost" size="sm" className="text-[var(--azure)]">
                    Vedi tutti
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {badgesLoading ? (
                <div className="flex gap-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="w-16 h-16 rounded-full" />
                  ))}
                </div>
              ) : recentBadges && recentBadges.length > 0 ? (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {recentBadges.slice(0, 5).map(({ badge, userBadge }) => (
                    <motion.div
                      key={badge.id}
                      whileHover={{ scale: 1.1 }}
                      className={`flex-shrink-0 w-16 h-16 rounded-full border-2 flex items-center justify-center badge-${badge.rarity}`}
                      style={{ 
                        backgroundColor: (badge.colorSecondary || "#3b82f6") + "20",
                        borderColor: badge.colorPrimary || "#1e3a5f",
                      }}
                    >
                      <Trophy className="h-7 w-7" style={{ color: badge.colorPrimary || "#1e3a5f" }} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Medal className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nessun badge ancora. Continua a nuotare!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[var(--azure)]" />
                  Attività Recenti
                </CardTitle>
                <Link href="/activities">
                  <Button variant="ghost" size="sm" className="text-[var(--azure)]">
                    Vedi tutte
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : activities && activities.length > 0 ? (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          activity.isOpenWater ? "bg-cyan-500/10" : "bg-[var(--azure)]/10"
                        }`}>
                          <Waves className={`h-5 w-5 ${
                            activity.isOpenWater ? "text-cyan-500" : "text-[var(--azure)]"
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-card-foreground">
                            {formatDistance(activity.distanceMeters)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(activity.activityDate)} • {formatTime(activity.durationSeconds)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[var(--gold)]">
                          +{activity.xpEarned} XP
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Nessuna attività registrata</p>
                  <p className="text-xs mt-1">Collega Garmin o aggiungi manualmente</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          <Link href="/leaderboard">
            <Card className="card-hover cursor-pointer border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium text-card-foreground">Classifica</p>
                  <p className="text-xs text-muted-foreground">Sfida i compagni</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/badges">
            <Card className="card-hover cursor-pointer border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[var(--gold)]/10 flex items-center justify-center">
                  <Award className="h-5 w-5 text-[var(--gold)]" />
                </div>
                <div>
                  <p className="font-medium text-card-foreground">Badge</p>
                  <p className="text-xs text-muted-foreground">Collezione completa</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </motion.div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
