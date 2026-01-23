import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
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

const rarityColors: Record<string, { border: string; glow: string; bg: string; text: string }> = {
  common: {
    border: "oklch(0.5 0.03 250)",
    glow: "oklch(0.5 0.03 250 / 0.3)",
    bg: "oklch(0.22 0.03 250)",
    text: "oklch(0.65 0.03 250)",
  },
  uncommon: {
    border: "oklch(0.70 0.20 145)",
    glow: "oklch(0.70 0.20 145 / 0.5)",
    bg: "oklch(0.25 0.08 145 / 0.3)",
    text: "oklch(0.70 0.20 145)",
  },
  rare: {
    border: "oklch(0.70 0.18 220)",
    glow: "oklch(0.70 0.18 220 / 0.6)",
    bg: "oklch(0.25 0.08 220 / 0.3)",
    text: "oklch(0.70 0.18 220)",
  },
  epic: {
    border: "oklch(0.65 0.22 300)",
    glow: "oklch(0.65 0.22 300 / 0.6)",
    bg: "oklch(0.25 0.10 300 / 0.3)",
    text: "oklch(0.65 0.22 300)",
  },
  legendary: {
    border: "oklch(0.85 0.18 85)",
    glow: "oklch(0.85 0.18 85 / 0.7)",
    bg: "oklch(0.30 0.10 85 / 0.3)",
    text: "oklch(0.85 0.18 85)",
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

        {/* Badge Grid - Fixed layout with proper sizing */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <Skeleton className="w-20 h-20 rounded-full bg-[oklch(0.20_0.03_250)]" />
                <Skeleton className="h-4 w-24 bg-[oklch(0.20_0.03_250)]" />
              </div>
            ))}
          </div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6"
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
                    className="cursor-pointer flex flex-col items-center"
                  >
                    {/* Badge Circle - Fixed size, perfectly round */}
                    <div 
                      className="w-20 h-20 rounded-full flex items-center justify-center relative flex-shrink-0"
                      style={isEarned ? {
                        background: `linear-gradient(135deg, ${colors.bg} 0%, oklch(0.16 0.035 250) 100%)`,
                        boxShadow: `0 0 25px ${colors.glow}`,
                      } : {
                        background: 'oklch(0.18 0.03 250)',
                        opacity: 0.6,
                      }}
                    >
                      {/* Gradient Border Ring */}
                      {isEarned && (
                        <div 
                          className="absolute inset-[-3px] rounded-full pointer-events-none"
                          style={{
                            background: `linear-gradient(135deg, ${colors.border} 0%, ${colors.border}80 100%)`,
                            padding: '3px',
                            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                            WebkitMaskComposite: 'xor',
                            maskComposite: 'exclude',
                          }}
                        />
                      )}
                      
                      {/* Locked Border */}
                      {!isEarned && (
                        <div 
                          className="absolute inset-[-2px] rounded-full pointer-events-none"
                          style={{
                            border: '2px dashed oklch(0.35 0.02 250)',
                          }}
                        />
                      )}
                      
                      {/* Icon */}
                      <div className="relative z-10">
                        {isEarned ? (
                          <IconComponent 
                            className="w-9 h-9" 
                            style={{ 
                              color: colors.border,
                              filter: `drop-shadow(0 0 8px ${colors.glow})`,
                            }}
                          />
                        ) : (
                          <Lock className="w-7 h-7 text-[oklch(0.40_0.02_250)]" />
                        )}
                      </div>
                    </div>
                    
                    {/* Badge Name - Full text, no truncation */}
                    <p 
                      className="text-center font-medium mt-3 text-sm leading-tight max-w-[100px]"
                      style={{ 
                        color: isEarned ? colors.text : 'oklch(0.45 0.02 250)',
                      }}
                    >
                      {badge.name}
                    </p>
                    
                    {/* Progress Bar for Locked Badges */}
                    {!isEarned && badge.progress > 0 && (
                      <div className="w-16 mt-2">
                        <div className="h-1 bg-[oklch(0.20_0.03_250)] rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full"
                            style={{ 
                              width: `${badge.progress}%`,
                              background: 'oklch(0.50 0.08 220)',
                            }}
                          />
                        </div>
                      </div>
                    )}
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
                              className="w-14 h-14 relative z-10" 
                              style={{ 
                                color: colors.border,
                                filter: `drop-shadow(0 0 15px ${colors.glow})`,
                              }}
                            />
                          ) : (
                            <Lock className="w-12 h-12 text-[oklch(0.40_0.02_250)]" />
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

                      {/* Description */}
                      <p className="text-center text-[oklch(0.70_0.03_220)] text-sm mb-4">
                        {badge.description}
                      </p>

                      {/* Requirement */}
                      <div className="bg-[oklch(0.14_0.03_250)] rounded-lg p-3 mb-4">
                        <p className="text-xs text-[oklch(0.55_0.03_220)] mb-1">Requisito</p>
                        <p className="text-sm text-[oklch(0.85_0.02_220)]">
                          {badge.requirementType === 'total_distance' && `Nuota ${(badge.requirementValue / 1000).toFixed(0)} km totali`}
                          {badge.requirementType === 'single_session' && `Nuota ${(badge.requirementValue / 1000).toFixed(1)} km in una sessione`}
                          {badge.requirementType === 'sessions_count' && `Completa ${badge.requirementValue} sessioni`}
                          {badge.requirementType === 'consecutive_weeks' && `Allenati per ${badge.requirementValue} settimane consecutive`}
                          {badge.requirementType === 'open_water_distance' && `Nuota ${(badge.requirementValue / 1000).toFixed(1)} km in acque libere`}
                          {badge.requirementType === 'total_time' && `Nuota per ${badge.requirementValue} ore totali`}
                          {badge.requirementType === 'level' && `Raggiungi il livello ${badge.requirementValue}`}
                          {badge.requirementType === 'special' && badge.description}
                        </p>
                      </div>

                      {/* Progress */}
                      {!isEarned && (
                        <div className="mb-4">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-[oklch(0.55_0.03_220)]">Progresso</span>
                            <span className="text-[oklch(0.70_0.18_220)]">{badge.progress}%</span>
                          </div>
                          <div className="h-2 bg-[oklch(0.20_0.03_250)] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ 
                                width: `${badge.progress}%`,
                                background: `linear-gradient(90deg, ${colors.border} 0%, ${colors.border}80 100%)`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Earned Date */}
                      {isEarned && badge.earnedAt && (
                        <div className="text-center">
                          <p className="text-xs text-[oklch(0.55_0.03_220)]">
                            Sbloccato il {new Date(badge.earnedAt).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                      )}

                      {/* Close Button */}
                      <Button
                        onClick={() => setSelectedBadge(null)}
                        className="w-full mt-4 glow-button"
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
