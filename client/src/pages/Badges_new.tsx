import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Lock,
  ChevronLeft,
  X,
  Sparkles,
} from "lucide-react";
import { Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState, useRef, useCallback } from "react";

// Mapping badge code to PNG file (new 3D badges)
const badgePngMap: Record<string, string> = {
  // Distanza
  "first_km": "/badges_new/first_km.png",
  "marathon_beginner": "/badges_new/marathon_beginner.png",
  "aquatic_marathon": "/badges_new/aquatic_marathon.png",
  "centurion": "/badges_new/centurion.png",
  "epic_crossing": "/badges_new/epic_crossing.png",
  "half_millennium": "/badges_new/half_millennium.png",
  "millionaire": "/badges_new/millionaire.png",
  // Sessione
  "solid_session": "/badges_new/solid_session.png",
  "endurance": "/badges_new/endurance.png",
  "ultra_swimmer": "/badges_new/ultra_swimmer.png",
  "unstoppable_machine": "/badges_new/unstoppable_machine.png",
  // Costanza
  "promising_start": "/badges_new/promising_start.png",
  "healthy_habit": "/badges_new/healthy_habit.png",
  "half_century": "/badges_new/half_century.png",
  "centenarian": "/badges_new/centenarian.png",
  "pool_devotee": "/badges_new/pool_devotee.png",
  "year_in_pool": "/badges_new/year_in_pool.png",
  // Acque Libere
  "sea_baptism": "/badges_new/sea_baptism.png",
  "navigator": "/badges_new/navigator.png",
  "sea_wolf": "/badges_new/sea_wolf.png",
  "marine_explorer": "/badges_new/marine_explorer.png",
  "crosser": "/badges_new/crosser.png",
  // Speciali
  "oppidum_member": "/badges_new/oppidum_member.png",
  "golden_octopus": "/badges_new/golden_octopus.png",
  // Traguardi
  "first_10_hours": "/badges_new/first_10_hours.png",
  "fifty_hours": "/badges_new/fifty_hours.png",
  "time_centenarian": "/badges_new/time_centenarian.png",
  "level_5": "/badges_new/level_5.png",
  "level_10": "/badges_new/level_10.png",
  "level_15": "/badges_new/level_15.png",
  "poseidon": "/badges_new/poseidon.png",
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

// Helper to get badge code from name
function getBadgeCode(name: string): string {
  const codeMap: Record<string, string> = {
    "Primo Chilometro": "first_km",
    "Maratoneta in Erba": "marathon_beginner",
    "Maratona Acquatica": "aquatic_marathon",
    "Centurione": "centurion",
    "Traversata Epica": "epic_crossing",
    "Mezzo Millennio": "half_millennium",
    "Il Milionario": "millionaire",
    "Sessione Solida": "solid_session",
    "Resistenza": "endurance",
    "Ultra Nuotatore": "ultra_swimmer",
    "Macchina Instancabile": "unstoppable_machine",
    "Inizio Promettente": "promising_start",
    "Abitudine Sana": "healthy_habit",
    "Mezzo Centinaio": "half_century",
    "Centenario": "centenarian",
    "Devoto alla Vasca": "pool_devotee",
    "Un Anno in Vasca": "year_in_pool",
    "Battesimo del Mare": "sea_baptism",
    "Navigatore": "navigator",
    "Lupo di Mare": "sea_wolf",
    "Esploratore Marino": "marine_explorer",
    "Attraversatore": "crosser",
    "Membro Oppidum": "oppidum_member",
    "Polpo d'Oro": "golden_octopus",
    "Prime 10 Ore": "first_10_hours",
    "50 Ore di Dedizione": "fifty_hours",
    "Centenario del Tempo": "time_centenarian",
    "Livello 5 Raggiunto": "level_5",
    "Livello 10 Raggiunto": "level_10",
    "Livello 15 Raggiunto": "level_15",
    "Poseidone": "poseidon",
  };
  return codeMap[name] || "first_km";
}

export default function Badges() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);
  const [showUnlockAnimation, setShowUnlockAnimation] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSoundUrl, setCurrentSoundUrl] = useState<string>("");

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

  // Get sound URL based on badge number and rarity
  const getBadgeSoundUrl = useCallback((badgeNumber: number, rarity: string): string => {
    // Legendary badges always get epic sound
    if (rarity === 'legendary') {
      return 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3';
    }
    
    // Otherwise use badge number for progression
    if (badgeNumber <= 10) {
      return 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'; // Quick Win
    } else if (badgeNumber <= 20) {
      return 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'; // Bonus Earned
    } else if (badgeNumber <= 30) {
      return 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3'; // Achievement Unlocked
    } else {
      return 'https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3'; // Epic Win
    }
  }, []);

  // Play sound effect with dynamic URL
  const playSound = useCallback((soundUrl: string) => {
    if (audioRef.current) {
      audioRef.current.src = soundUrl;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, []);

  const handleBadgeClick = (badge: any, badgeIndex: number) => {
    setSelectedBadge(badge);
    if (badge.earned) {
      const soundUrl = getBadgeSoundUrl(badgeIndex + 1, badge.rarity);
      playSound(soundUrl);
      setShowUnlockAnimation(true);
      setTimeout(() => setShowUnlockAnimation(false), 1200);
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Hidden audio element for badge sounds (dynamic source) */}
      <audio ref={audioRef} preload="auto" />

      {/* Custom CSS for 3D rotation and unlock animations */}
      <style>{`
        @keyframes badge-rotate {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }

        @keyframes badge-unlock {
          0% { 
            transform: scale(0.5) rotate(0deg); 
            opacity: 0;
          }
          50% { 
            transform: scale(1.2) rotate(180deg); 
            opacity: 1;
          }
          100% { 
            transform: scale(1) rotate(360deg); 
            opacity: 1;
          }
        }

        @keyframes sparkle {
          0%, 100% { 
            transform: scale(0) rotate(0deg); 
            opacity: 0;
          }
          50% { 
            transform: scale(1) rotate(180deg); 
            opacity: 1;
          }
        }

        .badge-3d {
          transform-style: preserve-3d;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .badge-3d:hover {
          animation: badge-rotate 1s ease-in-out;
        }

        .badge-unlock-animation {
          animation: badge-unlock 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .sparkle-particle {
          position: absolute;
          width: 8px;
          height: 8px;
          background: radial-gradient(circle, #fff 0%, transparent 70%);
          border-radius: 50%;
          pointer-events: none;
          animation: sparkle 1s ease-out forwards;
        }

        .sparkle-particle:nth-child(1) { top: 10%; left: 10%; animation-delay: 0s; }
        .sparkle-particle:nth-child(2) { top: 20%; right: 15%; animation-delay: 0.1s; }
        .sparkle-particle:nth-child(3) { bottom: 20%; left: 20%; animation-delay: 0.2s; }
        .sparkle-particle:nth-child(4) { bottom: 15%; right: 10%; animation-delay: 0.15s; }
        .sparkle-particle:nth-child(5) { top: 50%; left: 5%; animation-delay: 0.25s; }
        .sparkle-particle:nth-child(6) { top: 50%; right: 5%; animation-delay: 0.3s; }
      `}</style>

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-3">
                <Skeleton className="w-24 h-24 rounded-full bg-[oklch(0.20_0.03_250)]" />
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
              {filteredBadges?.map((badge, index) => {
                const isEarned = badge.earned;
                const colors = rarityColors[badge.rarity] || rarityColors.common;
                const badgeCode = getBadgeCode(badge.name);
                const pngPath = badgePngMap[badgeCode];

                return (
                  <motion.div
                    key={badge.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleBadgeClick(badge, badgeProgress?.indexOf(badge) || index)}
                    className="cursor-pointer flex flex-col items-center"
                  >
                    {/* Badge Container with 3D rotation */}
                    <div 
                      className={`w-24 h-24 flex items-center justify-center relative flex-shrink-0 ${isEarned ? 'badge-3d' : ''}`}
                      style={isEarned ? {
                        filter: `drop-shadow(0 0 20px ${colors.glow}) drop-shadow(0 0 40px ${colors.glow})`,
                      } : {
                        opacity: 0.4,
                        filter: 'grayscale(100%)',
                      }}
                    >
                      {/* Badge Image */}
                      <div className="relative z-10 w-full h-full flex items-center justify-center">
                        {isEarned && pngPath ? (
                          <img 
                            src={pngPath} 
                            alt={badge.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div 
                            className="w-20 h-20 rounded-full flex items-center justify-center relative"
                            style={{
                              background: 'oklch(0.18 0.03 250)',
                              border: '2px dashed oklch(0.35 0.02 250)',
                            }}
                          >
                            <Lock className="w-8 h-8 text-[oklch(0.40_0.02_250)]" />
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Badge Name */}
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
          {selectedBadge && (
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
                className="neon-card p-6 max-w-sm w-full relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Sparkle particles for unlock animation */}
                {selectedBadge.earned && showUnlockAnimation && (
                  <>
                    <div className="sparkle-particle" />
                    <div className="sparkle-particle" />
                    <div className="sparkle-particle" />
                    <div className="sparkle-particle" />
                    <div className="sparkle-particle" />
                    <div className="sparkle-particle" />
                  </>
                )}

                {/* Close button */}
                <button 
                  onClick={() => setSelectedBadge(null)}
                  className="absolute top-4 right-4 text-[oklch(0.60_0.03_220)] hover:text-[oklch(0.80_0.03_220)] z-10"
                >
                  <X className="w-5 w-5" />
                </button>

                {/* Badge Display */}
                <div className="flex flex-col items-center text-center relative">
                  {/* Large Badge */}
                  <div 
                    className={`w-40 h-40 flex items-center justify-center relative mb-4 ${
                      selectedBadge.earned && showUnlockAnimation ? 'badge-unlock-animation' : ''
                    }`}
                    style={selectedBadge.earned ? {
                      filter: `drop-shadow(0 0 30px ${rarityColors[selectedBadge.rarity]?.glow || rarityColors.common.glow}) drop-shadow(0 0 60px ${rarityColors[selectedBadge.rarity]?.glow || rarityColors.common.glow})`,
                    } : {}}
                  >
                    {selectedBadge.earned ? (
                      <img 
                        src={badgePngMap[getBadgeCode(selectedBadge.name)]} 
                        alt={selectedBadge.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div 
                        className="w-32 h-32 rounded-full flex items-center justify-center"
                        style={{ 
                          background: 'oklch(0.18 0.03 250)',
                          border: '3px dashed oklch(0.35 0.02 250)',
                        }}
                      >
                        <Lock className="w-16 h-16 text-[oklch(0.40_0.02_250)]" />
                      </div>
                    )}
                  </div>

                  {/* Badge Info */}
                  <h3 
                    className="text-xl font-bold mb-1"
                    style={{ color: rarityColors[selectedBadge.rarity]?.text || rarityColors.common.text }}
                  >
                    {selectedBadge.name}
                  </h3>
                  
                  <span 
                    className="text-xs font-medium px-3 py-1 rounded-full mb-3 flex items-center gap-1"
                    style={{
                      background: rarityColors[selectedBadge.rarity]?.bg || rarityColors.common.bg,
                      color: rarityColors[selectedBadge.rarity]?.text || rarityColors.common.text,
                    }}
                  >
                    {selectedBadge.rarity === 'legendary' && <Sparkles className="w-3 h-3" />}
                    {rarityLabels[selectedBadge.rarity] || "Comune"}
                    {selectedBadge.rarity === 'legendary' && <Sparkles className="w-3 h-3" />}
                  </span>
                  
                  <p className="text-[oklch(0.70_0.03_220)] text-sm mb-4">
                    {selectedBadge.description}
                  </p>

                  {/* Progress or Earned Date */}
                  {selectedBadge.earned ? (
                    <div className="text-[oklch(0.60_0.03_220)] text-xs">
                      Sbloccato il {new Date(selectedBadge.earnedAt).toLocaleDateString('it-IT')}
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[oklch(0.60_0.03_220)]">Progresso</span>
                        <span className="text-[oklch(0.70_0.18_220)]">{selectedBadge.progress}%</span>
                      </div>
                      <div className="h-2 bg-[oklch(0.20_0.03_250)] rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ 
                            width: `${selectedBadge.progress}%`,
                            background: 'linear-gradient(90deg, oklch(0.50 0.08 220), oklch(0.70 0.18 220))',
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <MobileNav />
    </div>
  );
}
