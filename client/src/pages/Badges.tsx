import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Medal,
  Star,
  Award,
  Waves,
  Target,
  Clock,
  Crown,
  Gem,
  Flame,
  Zap,
  Calendar,
  Heart,
  Compass,
  Anchor,
  Lock,
  Check,
  ChevronLeft,
} from "lucide-react";
import { useLocation, Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState, useEffect, useRef } from "react";

// Icon mapping
const iconMap: Record<string, React.ComponentType<any>> = {
  trophy: Trophy,
  medal: Medal,
  star: Star,
  award: Award,
  crown: Crown,
  gem: Gem,
  diamond: Gem,
  flame: Flame,
  zap: Zap,
  rocket: Zap,
  battery: Zap,
  calendar: Calendar,
  "calendar-check": Calendar,
  target: Target,
  heart: Heart,
  sun: Star,
  waves: Waves,
  compass: Compass,
  ship: Anchor,
  anchor: Anchor,
  globe: Waves,
  users: Trophy,
  octagon: Crown,
  clock: Clock,
  hourglass: Clock,
  timer: Clock,
  "arrow-up": Star,
  "arrow-up-circle": Star,
  "chevrons-up": Star,
};

const categoryLabels: Record<string, string> = {
  all: "Tutti",
  distance: "Distanza",
  session: "Sessione",
  consistency: "Costanza",
  open_water: "Acque Libere",
  special: "Speciali",
  milestone: "Traguardi",
};

const rarityLabels: Record<string, string> = {
  common: "Comune",
  uncommon: "Non Comune",
  rare: "Raro",
  epic: "Epico",
  legendary: "Leggendario",
};

export default function Badges() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBadge, setSelectedBadge] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: badgeProgress, isLoading } = trpc.badges.progress.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Redirect if not authenticated - use Redirect component instead of setLocation during render
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  // Filter badges by category
  const filteredBadges = badgeProgress?.filter(
    (b) => selectedCategory === "all" || b.category === selectedCategory
  );

  // Count earned badges
  const earnedCount = badgeProgress?.filter((b) => b.earned).length || 0;
  const totalCount = badgeProgress?.length || 0;

  // Play sound effect
  const playSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  // Get icon component
  const getIcon = (iconName: string) => {
    return iconMap[iconName] || Trophy;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hidden audio element for badge sounds */}
      <audio ref={audioRef} preload="auto">
        <source src="https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3" type="audio/mpeg" />
      </audio>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-[var(--navy)] to-[var(--navy-light)] text-white">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-semibold text-lg">Bacheca Badge</h1>
              <p className="text-sm text-white/70">
                {earnedCount} / {totalCount} sbloccati
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Progress Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Progresso Collezione</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round((earnedCount / Math.max(totalCount, 1)) * 100)}%
                </span>
              </div>
              <Progress 
                value={(earnedCount / Math.max(totalCount, 1)) * 100} 
                className="h-2"
              />
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Tabs */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 min-w-max pb-2">
            {Object.entries(categoryLabels).map(([key, label]) => (
              <Button
                key={key}
                variant={selectedCategory === key ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(key)}
                className={selectedCategory === key 
                  ? "bg-[var(--navy)] hover:bg-[var(--navy-light)]" 
                  : ""
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Badge Grid */}
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {filteredBadges?.map((badge) => {
                const IconComponent = getIcon(badge.iconName);
                const isEarned = badge.earned;

                return (
                  <motion.div
                    key={badge.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedBadge(badge.id);
                      if (isEarned) playSound();
                    }}
                    className="cursor-pointer"
                  >
                    <div
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center p-2 transition-all ${
                        isEarned
                          ? `badge-${badge.rarity} bg-gradient-to-br from-white to-muted`
                          : "border-border bg-muted/30 opacity-50"
                      }`}
                      style={isEarned ? {
                        borderColor: badge.colorPrimary || "#1e3a5f",
                      } : {}}
                    >
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center mb-1 ${
                          isEarned ? "" : "bg-muted"
                        }`}
                        style={isEarned ? {
                          backgroundColor: (badge.colorSecondary || "#3b82f6") + "30",
                        } : {}}
                      >
                        {isEarned ? (
                          <IconComponent className="h-6 w-6" />
                        ) : (
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <p className={`text-xs text-center font-medium line-clamp-2 ${
                        isEarned ? "text-card-foreground" : "text-muted-foreground"
                      }`}>
                        {badge.name}
                      </p>
                      {!isEarned && badge.progress > 0 && (
                        <div className="w-full mt-1">
                          <Progress value={badge.progress} className="h-1" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Badge Detail Modal */}
        <AnimatePresence>
          {selectedBadge && badgeProgress && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
              onClick={() => setSelectedBadge(null)}
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl"
              >
                {(() => {
                  const badge = badgeProgress.find((b) => b.id === selectedBadge);
                  if (!badge) return null;

                  const IconComponent = getIcon(badge.iconName);
                  const isEarned = badge.earned;

                  return (
                    <>
                      {/* Badge Icon */}
                      <div className="flex justify-center mb-4">
                        <motion.div
                          initial={isEarned ? { scale: 0, rotate: -180 } : {}}
                          animate={isEarned ? { scale: 1, rotate: 0 } : {}}
                          transition={{ type: "spring", duration: 0.6 }}
                          className={`w-24 h-24 rounded-full border-4 flex items-center justify-center ${
                            isEarned ? `badge-${badge.rarity}` : "border-border bg-muted"
                          }`}
                          style={isEarned ? {
                            borderColor: badge.colorPrimary || "#1e3a5f",
                            backgroundColor: (badge.colorSecondary || "#3b82f6") + "20",
                          } : {}}
                        >
                          {isEarned ? (
                            <IconComponent className="h-12 w-12" />
                          ) : (
                            <Lock className="h-10 w-10 text-muted-foreground" />
                          )}
                        </motion.div>
                      </div>

                      {/* Badge Info */}
                      <div className="text-center mb-4">
                        <h3 className="text-xl font-bold text-card-foreground mb-1">
                          {badge.name}
                        </h3>
                        <p className={`text-sm font-medium rarity-${badge.rarity}`}>
                          {rarityLabels[badge.rarity]}
                        </p>
                      </div>

                      <p className="text-center text-muted-foreground mb-4">
                        {badge.description}
                      </p>

                      {/* Progress or Earned Date */}
                      {isEarned ? (
                        <div className="flex items-center justify-center gap-2 text-green-500 mb-4">
                          <Check className="h-5 w-5" />
                          <span className="text-sm font-medium">
                            Sbloccato il {new Date(badge.earnedAt!).toLocaleDateString("it-IT")}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">Progresso</span>
                            <span className="font-medium">{badge.progress}%</span>
                          </div>
                          <Progress value={badge.progress} className="h-2" />
                        </div>
                      )}

                      {/* XP Reward */}
                      <div className="flex items-center justify-center gap-2 text-[var(--gold)]">
                        <Zap className="h-5 w-5" />
                        <span className="font-semibold">+{badge.xpReward} XP</span>
                      </div>

                      {/* Close Button */}
                      <Button
                        variant="outline"
                        className="w-full mt-6"
                        onClick={() => setSelectedBadge(null)}
                      >
                        Chiudi
                      </Button>
                    </>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <MobileNav />
    </div>
  );
}
