import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  Sparkles,
} from "lucide-react";
import { Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState, useRef, useCallback } from "react";

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
  sparkles: Sparkles,
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

const rarityColors: Record<string, { border: string; glow: string; bg: string }> = {
  common: {
    border: "oklch(0.5 0.03 250)",
    glow: "oklch(0.5 0.03 250 / 0.3)",
    bg: "oklch(0.22 0.03 250)",
  },
  uncommon: {
    border: "oklch(0.70 0.20 145)",
    glow: "oklch(0.70 0.20 145 / 0.5)",
    bg: "oklch(0.25 0.08 145 / 0.3)",
  },
  rare: {
    border: "oklch(0.70 0.18 220)",
    glow: "oklch(0.70 0.18 220 / 0.6)",
    bg: "oklch(0.25 0.08 220 / 0.3)",
  },
  epic: {
    border: "oklch(0.65 0.22 300)",
    glow: "oklch(0.65 0.22 300 / 0.6)",
    bg: "oklch(0.25 0.10 300 / 0.3)",
  },
  legendary: {
    border: "oklch(0.85 0.18 85)",
    glow: "oklch(0.85 0.18 85 / 0.7)",
    bg: "oklch(0.30 0.10 85 / 0.3)",
  },
};

export default function Badges() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBadge, setSelectedBadge] = useState<number | null>(null);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: badgeProgress, isLoading } = trpc.badges.progress.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // Redirect if not authenticated
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
  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  // Get icon component
  const getIcon = (iconName: string) => {
    return iconMap[iconName] || Trophy;
  };

  const handleBadgeClick = (badge: any) => {
    setSelectedBadge(badge.id);
    if (badge.earned) {
      playSound();
      setShowUnlockAnimation(true);
      setTimeout(() => setShowUnlockAnimation(false), 800);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Hidden audio element for badge sounds */}
      <audio ref={audioRef} preload="auto">
        <source src="https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3" type="audio/mpeg" />
      </audio>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--navy)]/95 backdrop-blur-lg border-b border-[oklch(0.30_0.04_250_/_0.5)]">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="text-[oklch(0.70_0.18_220)] hover:bg-[oklch(0.70_0.18_220_/_0.1)]">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-bold text-lg text-[oklch(0.95_0.01_220)]">Bacheca Badge</h1>
              <p className="text-sm text-[oklch(0.60_0.03_220)]">
                <span className="text-[oklch(0.70_0.18_220)]">{earnedCount}</span> / {totalCount} sbloccati
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Progress Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neon-card p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[oklch(0.82_0.18_85)]" />
              <span className="text-sm font-medium text-[oklch(0.95_0.01_220)]">Progresso Collezione</span>
            </div>
            <span className="text-sm font-bold text-[oklch(0.70_0.18_220)]">
              {Math.round((earnedCount / Math.max(totalCount, 1)) * 100)}%
            </span>
          </div>
          <div className="xp-bar-container">
            <div 
              className="xp-bar-fill" 
              style={{ width: `${(earnedCount / Math.max(totalCount, 1)) * 100}%` }}
            />
          </div>
        </motion.div>

        {/* Category Tabs */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-2 min-w-max pb-2">
            {Object.entries(categoryLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedCategory(key)}
                className={`game-tab ${selectedCategory === key ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Badge Grid */}
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl bg-[oklch(0.20_0.03_250)]" />
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
                const colors = rarityColors[badge.rarity] || rarityColors.common;

                return (
                  <motion.div
                    key={badge.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBadgeClick(badge)}
                    className="cursor-pointer"
                  >
                    <div className={`badge-container ${isEarned ? `badge-${badge.rarity}` : 'badge-locked'}`}>
                      <div 
                        className="badge-frame"
                        style={isEarned ? {
                          boxShadow: `0 0 20px ${colors.glow}`,
                          background: `linear-gradient(135deg, ${colors.bg} 0%, oklch(0.16 0.035 250) 100%)`,
                        } : {}}
                      >
                        {/* Gradient Border */}
                        {isEarned && (
                          <div 
                            className="absolute inset-[-3px] rounded-full"
                            style={{
                              background: `linear-gradient(135deg, ${colors.border} 0%, ${colors.border}80 100%)`,
                              padding: '3px',
                              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                              WebkitMaskComposite: 'xor',
                              maskComposite: 'exclude',
                            }}
                          />
                        )}
                        
                        {/* Icon */}
                        <div className="relative z-10">
                          {isEarned ? (
                            <IconComponent 
                              className="h-8 w-8" 
                              style={{ 
                                color: colors.border,
                                filter: `drop-shadow(0 0 8px ${colors.glow})`,
                              }}
                            />
                          ) : (
                            <Lock className="h-6 w-6 text-[oklch(0.40_0.02_250)]" />
                          )}
                        </div>
                      </div>
                      
                      {/* Badge Name */}
                      <p className={`text-xs text-center font-medium mt-2 line-clamp-2 ${
                        isEarned ? "text-[oklch(0.85_0.02_220)]" : "text-[oklch(0.45_0.02_250)]"
                      }`}>
                        {badge.name}
                      </p>
                      
                      {/* Progress Bar for Locked Badges */}
                      {!isEarned && badge.progress > 0 && (
                        <div className="w-full mt-1 px-2">
                          <div className="h-1 bg-[oklch(0.20_0.03_250)] rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[oklch(0.50_0.08_220)]" 
                              style={{ width: `${badge.progress}%` }}
                            />
                          </div>
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
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setSelectedBadge(null)}
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="neon-card p-6 max-w-sm w-full"
              >
                {(() => {
                  const badge = badgeProgress.find((b) => b.id === selectedBadge);
                  if (!badge) return null;

                  const IconComponent = getIcon(badge.iconName);
                  const isEarned = badge.earned;
                  const colors = rarityColors[badge.rarity] || rarityColors.common;

                  return (
                    <>
                      {/* Badge Icon with Animation */}
                      <div className="flex justify-center mb-6 relative">
                        {/* Particle Burst Effect */}
                        {showUnlockAnimation && isEarned && (
                          <div className="particle-burst absolute inset-0" />
                        )}
                        
                        <motion.div
                          initial={isEarned ? { scale: 0, rotate: -180 } : {}}
                          animate={isEarned ? { scale: 1, rotate: 0 } : {}}
                          transition={{ type: "spring", duration: 0.8 }}
                          className="w-28 h-28 rounded-full flex items-center justify-center relative"
                          style={isEarned ? {
                            background: `linear-gradient(135deg, ${colors.bg} 0%, oklch(0.16 0.035 250) 100%)`,
                            boxShadow: `0 0 40px ${colors.glow}, 0 0 80px ${colors.glow}`,
                          } : {
                            background: 'oklch(0.18 0.03 250)',
                          }}
                        >
                          {/* Gradient Border */}
                          {isEarned && (
                            <div 
                              className="absolute inset-[-4px] rounded-full"
                              style={{
                                background: `linear-gradient(135deg, ${colors.border} 0%, ${colors.border}60 100%)`,
                                padding: '4px',
                                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                WebkitMaskComposite: 'xor',
                                maskComposite: 'exclude',
                              }}
                            />
                          )}
                          
                          {isEarned ? (
                            <IconComponent 
                              className="h-14 w-14 relative z-10" 
                              style={{ 
                                color: colors.border,
                                filter: `drop-shadow(0 0 15px ${colors.glow})`,
                              }}
                            />
                          ) : (
                            <Lock className="h-12 w-12 text-[oklch(0.40_0.02_250)]" />
                          )}
                        </motion.div>
                      </div>

                      {/* Badge Info */}
                      <div className="text-center mb-4">
                        <h3 className="text-xl font-bold text-[oklch(0.95_0.01_220)] mb-2">
                          {badge.name}
                        </h3>
                        <p 
                          className="text-sm font-semibold"
                          style={{ color: colors.border }}
                        >
                          {rarityLabels[badge.rarity]}
                        </p>
                      </div>

                      <p className="text-center text-[oklch(0.65_0.03_220)] mb-6">
                        {badge.description}
                      </p>

                      {/* Progress or Earned Date */}
                      {isEarned ? (
                        <div className="flex items-center justify-center gap-2 text-[oklch(0.70_0.20_145)] mb-4 p-3 rounded-lg bg-[oklch(0.70_0.20_145_/_0.1)] border border-[oklch(0.70_0.20_145_/_0.3)]">
                          <Check className="h-5 w-5" />
                          <span className="text-sm font-medium">
                            Sbloccato il {new Date(badge.earnedAt!).toLocaleDateString("it-IT")}
                          </span>
                        </div>
                      ) : (
                        <div className="mb-4 p-3 rounded-lg bg-[oklch(0.18_0.03_250)]">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-[oklch(0.60_0.03_220)]">Progresso</span>
                            <span className="font-bold text-[oklch(0.70_0.18_220)]">{badge.progress}%</span>
                          </div>
                          <div className="xp-bar-container">
                            <div 
                              className="h-full bg-[oklch(0.50_0.10_220)] rounded-full" 
                              style={{ width: `${badge.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* XP Reward */}
                      <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-[oklch(0.82_0.18_85_/_0.1)] border border-[oklch(0.82_0.18_85_/_0.3)]">
                        <Zap className="h-5 w-5 text-[oklch(0.82_0.18_85)]" />
                        <span className="font-bold text-[oklch(0.82_0.18_85)]">+{badge.xpReward} XP</span>
                      </div>

                      {/* Close Button */}
                      <Button
                        className="w-full mt-6 glow-button"
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
