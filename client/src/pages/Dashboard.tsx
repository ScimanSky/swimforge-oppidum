import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  Waves,
  Clock,
  Target,
  Medal,
  ChevronRight,
  Zap,
  Activity,
  User,
  Plus,
  Trophy,
} from "lucide-react";
import { Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";

export default function Dashboard() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();

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

  const { data: challenges, isLoading: challengesLoading } = trpc.challenges.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Redirect to home if not authenticated
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--navy)]/95 backdrop-blur-lg border-b border-[oklch(0.30_0.04_250_/_0.5)]">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/oppidum-logo.png" alt="Oppidum" className="h-8 w-auto" />
              <span className="font-bold text-lg text-[oklch(0.95_0.01_220)]">SwimForge</span>
            </div>
            <Link href="/profile">
              <Button variant="ghost" size="icon" className="text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.70_0.18_220_/_0.1)]">
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
          <div className="neon-card p-6">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-32 bg-[oklch(0.25_0.03_250)]" />
                <Skeleton className="h-8 w-48 bg-[oklch(0.25_0.03_250)]" />
              </div>
            ) : (
              <>
                <p className="text-[oklch(0.60_0.03_220)] text-sm">Bentornato,</p>
                <h1 className="text-2xl font-bold mb-6 text-[oklch(0.95_0.01_220)]">{user?.name || "Nuotatore"}</h1>
                
                {/* Level Badge */}
                <div className="flex items-center gap-4 mb-6">
                  <motion.div 
                    className="level-badge"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", duration: 0.6 }}
                  >
                    <span className="text-2xl font-bold text-[oklch(0.95_0.01_220)]">
                      {profile?.level || 1}
                    </span>
                  </motion.div>
                  <div>
                    <p className="text-[oklch(0.60_0.03_220)] text-sm uppercase tracking-wider">Livello</p>
                    <p className="text-xl font-bold text-[oklch(0.70_0.18_220)]">{profile?.levelTitle || "Novizio"}</p>
                  </div>
                </div>

                {/* XP Progress */}
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-[oklch(0.60_0.03_220)] flex items-center gap-1">
                      <Zap className="h-4 w-4 text-[oklch(0.82_0.18_85)]" />
                      XP Totali
                    </span>
                    <span className="font-bold text-[oklch(0.82_0.18_85)]">{profile?.totalXp?.toLocaleString() || 0} XP</span>
                  </div>
                  <div className="xp-bar-container">
                    <motion.div
                      className="xp-bar-fill"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(xpProgress, 100)}%` }}
                      transition={{ duration: 1, delay: 0.3 }}
                    />
                  </div>
                  {profile?.nextLevelXp && (
                    <p className="text-xs text-[oklch(0.50_0.03_220)] text-right">
                      {profile.xpToNextLevel.toLocaleString()} XP al prossimo livello
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
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
              color: "oklch(0.70 0.18 220)",
              glowColor: "oklch(0.70 0.18 220 / 0.3)",
            },
            {
              icon: Clock,
              label: "Tempo",
              value: isLoading ? "..." : formatTime(profile?.totalTimeSeconds || 0),
              color: "oklch(0.82 0.18 85)",
              glowColor: "oklch(0.82 0.18 85 / 0.3)",
            },
            {
              icon: Target,
              label: "Sessioni",
              value: isLoading ? "..." : profile?.totalSessions?.toString() || "0",
              color: "oklch(0.70 0.20 145)",
              glowColor: "oklch(0.70 0.20 145 / 0.3)",
            },
          ].map((stat) => (
            <div key={stat.label} className="stat-card">
              <div 
                className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                style={{ 
                  backgroundColor: `${stat.glowColor}`,
                  boxShadow: `0 0 15px ${stat.glowColor}`,
                }}
              >
                <stat.icon className="h-5 w-5" style={{ color: stat.color }} />
              </div>
              <p className="text-lg font-bold text-[oklch(0.95_0.01_220)]">{stat.value}</p>
              <p className="text-xs text-[oklch(0.50_0.03_220)]">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* Progress Charts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div className="neon-card p-4">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-[oklch(0.95_0.01_220)]">
              <Activity className="h-5 w-5 text-[oklch(0.70_0.18_220)]" />
              Progressi Settimanali
            </h3>
            
            {activitiesLoading ? (
              <Skeleton className="h-48 w-full bg-[oklch(0.20_0.03_250)]" />
            ) : activities && activities.length > 0 ? (
              <div className="h-48 flex items-end justify-between gap-2 px-2">
                {activities.slice(0, 7).reverse().map((activity, idx) => {
                  const maxDistance = Math.max(...activities.slice(0, 7).map(a => a.distanceMeters));
                  const height = (activity.distanceMeters / maxDistance) * 100;
                  const date = new Date(activity.activityDate);
                  const dayName = date.toLocaleDateString('it-IT', { weekday: 'short' });
                  
                  return (
                    <div key={activity.id} className="flex-1 flex flex-col items-center gap-2">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        className="w-full rounded-t-lg relative group"
                        style={{
                          background: activity.isOpenWater 
                            ? 'linear-gradient(to top, oklch(0.70 0.15 195), oklch(0.70 0.15 195 / 0.6))'
                            : 'linear-gradient(to top, oklch(0.70 0.18 220), oklch(0.70 0.18 220 / 0.6))',
                          boxShadow: activity.isOpenWater
                            ? '0 0 10px oklch(0.70 0.15 195 / 0.5)'
                            : '0 0 10px oklch(0.70 0.18 220 / 0.5)',
                          minHeight: '20px',
                        }}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="bg-[oklch(0.15_0.03_250)] px-2 py-1 rounded text-xs whitespace-nowrap border border-[oklch(0.30_0.04_250)]">
                            <p className="font-bold text-[oklch(0.95_0.01_220)]">{(activity.distanceMeters / 1000).toFixed(1)} km</p>
                            <p className="text-[oklch(0.60_0.03_220)]">{formatDate(activity.activityDate)}</p>
                          </div>
                        </div>
                      </motion.div>
                      <p className="text-xs text-[oklch(0.60_0.03_220)] font-medium">{dayName}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center">
                <p className="text-sm text-[oklch(0.50_0.03_220)]">Nessuna attività recente</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Active Challenges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="neon-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-[oklch(0.95_0.01_220)]">
                <Trophy className="h-5 w-5 text-[oklch(0.82_0.18_85)]" />
                Sfide Attive
              </h3>
              <Link href="/challenges">
                <Button variant="ghost" size="sm" className="text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.70_0.18_220_/_0.1)]">
                  Crea Sfida
                  <Plus className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            
            <div className="space-y-3">
              {challengesLoading ? (
                <div className="text-center py-4">
                  <p className="text-sm text-[oklch(0.60_0.03_220)]">Caricamento...</p>
                </div>
              ) : challenges && challenges.length > 0 ? (
                challenges.slice(0, 2).map((challenge: any) => (
                  <div key={challenge.id} className="p-3 rounded-lg bg-[oklch(0.18_0.03_250)] border border-[oklch(0.30_0.04_250)]">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-[oklch(0.95_0.01_220)] text-sm">{challenge.name}</h4>
                      <span className="text-xs text-[oklch(0.70_0.18_85)] font-medium">
                        {challenge.status === 'active' ? '✅ Attiva' : '⏳ In Arrivo'}
                      </span>
                    </div>
                    <p className="text-xs text-[oklch(0.60_0.03_220)] mb-2">
                      {challenge.type === 'pool' ? '🏊 Piscina' : challenge.type === 'open_water' ? '🌊 Acque Libere' : '🏊🌊 Entrambi'}
                      {' • '}
                      {challenge.duration === '3_days' ? '3 giorni' : challenge.duration === '1_week' ? '1 settimana' : challenge.duration === '2_weeks' ? '2 settimane' : '1 mese'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[oklch(0.50_0.03_220)]">
                        {challenge.participantCount || 0} partecipanti
                      </span>
                      <Link href="/challenges">
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.70_0.18_220_/_0.1)]">
                          Dettagli
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Trophy className="h-12 w-12 mx-auto mb-3 text-[oklch(0.70_0.18_220)]" />
                  <p className="text-sm text-[oklch(0.60_0.03_220)] mb-4">Nessuna sfida attiva al momento</p>
                  <Link href="/challenges">
                    <Button className="bg-gradient-to-r from-[oklch(0.70_0.18_220)] to-[oklch(0.70_0.15_195)] hover:opacity-90">
                      <Plus className="h-4 w-4 mr-2" />
                      Crea la Tua Prima Sfida
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Recent Activities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="neon-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2 text-[oklch(0.95_0.01_220)]">
                <Activity className="h-5 w-5 text-[oklch(0.70_0.18_220)]" />
                Log Attività
              </h3>
              <Link href="/activities">
                <Button variant="ghost" size="sm" className="text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.70_0.18_220_/_0.1)]">
                  Cronologia
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            
            {activitiesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full bg-[oklch(0.20_0.03_250)]" />
                ))}
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-[oklch(0.18_0.03_250)] hover:bg-[oklch(0.20_0.03_250)] transition-colors border border-[oklch(0.25_0.03_250)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        activity.isOpenWater 
                          ? "bg-[oklch(0.70_0.15_195_/_0.2)]" 
                          : "bg-[oklch(0.70_0.18_220_/_0.2)]"
                      }`}>
                        <Waves className={`h-5 w-5 ${
                          activity.isOpenWater 
                            ? "text-[oklch(0.70_0.15_195)]" 
                            : "text-[oklch(0.70_0.18_220)]"
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-[oklch(0.90_0.02_220)]">
                          {formatDistance(activity.distanceMeters)}
                        </p>
                        <p className="text-xs text-[oklch(0.50_0.03_220)]">
                          {formatDate(activity.activityDate)} • {formatTime(activity.durationSeconds)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-1">
                      <Zap className="h-4 w-4 text-[oklch(0.82_0.18_85)]" />
                      <span className="text-sm font-bold text-[oklch(0.82_0.18_85)]">
                        +{activity.xpEarned}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Activity className="h-10 w-10 mx-auto mb-2 text-[oklch(0.35_0.03_250)]" />
                <p className="text-sm text-[oklch(0.50_0.03_220)]">Nessuna attività registrata</p>
                <p className="text-xs mt-1 text-[oklch(0.40_0.03_220)]">Collega Garmin o aggiungi manualmente</p>
              </div>
            )}
          </div>
        </motion.div>


      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
