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
} from "lucide-react";
import { Link, Redirect } from "wouter";
import MobileNav from "@/components/MobileNav";
import { useState, useRef, useCallback } from "react";

// Mapping badge code to SVG file
const badgeSvgMap: Record<string, string> = {
  // Distanza
  "first_km": "/badges/first_km.svg",
  "marathon_beginner": "/badges/marathon_beginner.svg",
  "aquatic_marathon": "/badges/aquatic_marathon.svg",
  "centurion": "/badges/centurion.svg",
  "epic_crossing": "/badges/epic_crossing.svg",
  "half_millennium": "/badges/half_millennium.svg",
  "millionaire": "/badges/millionaire.svg",
  // Sessione
  "solid_session": "/badges/solid_session.svg",
  "endurance": "/badges/endurance.svg",
  "ultra_swimmer": "/badges/ultra_swimmer.svg",
  "unstoppable_machine": "/badges/unstoppable_machine.svg",
  // Costanza
  "promising_start": "/badges/promising_start.svg",
  "healthy_habit": "/badges/healthy_habit.svg",
  "half_century": "/badges/half_century.svg",
  "centenarian": "/badges/centenarian.svg",
  "pool_devotee": "/badges/pool_devotee.svg",
  "year_in_pool": "/badges/year_in_pool.svg",
  // Acque Libere
  "sea_baptism": "/badges/sea_baptism.svg",
  "navigator": "/badges/navigator.svg",
  "sea_wolf": "/badges/sea_wolf.svg",
  "marine_explorer": "/badges/marine_explorer.svg",
  "crosser": "/badges/crosser.svg",
  // Speciali
  "oppidum_member": "/badges/oppidum_member.svg",
  "golden_octopus": "/badges/golden_octopus.svg",
  // Traguardi
  "first_10_hours": "/badges/first_10_hours.svg",
  "fifty_hours": "/badges/fifty_hours.svg",
  "time_centenarian": "/badges/time_centenarian.svg",
  "level_5": "/badges/level_5.svg",
  "level_10": "/badges/level_10.svg",
  "level_15": "/badges/level_15.svg",
  "poseidon": "/badges/poseidon.svg",
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
    "Nuotatore Certificato": "oppidum_member",
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

  const handleBadgeClick = (badge: any) => {
    setSelectedBadge(badge);
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
                const isEarned = badge.earned;
                const colors = rarityColors[badge.rarity] || rarityColors.common;
                const badgeCode = getBadgeCode(badge.name);
                const svgPath = badgeSvgMap[badgeCode];

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
                    {/* Badge Circle with SVG */}
                    <div 
                      className="w-20 h-20 rounded-full flex items-center justify-center relative flex-shrink-0 overflow-hidden"
                      style={isEarned ? {
                        boxShadow: `0 0 25px ${colors.glow}, 0 0 50px ${colors.glow}`,
                      } : {
                        opacity: 0.5,
                      }}
                    >
                      {/* Gradient Border Ring for earned badges */}
                      {isEarned && (
                        <div 
                          className="absolute inset-[-3px] rounded-full pointer-events-none animate-pulse"
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
                      
                      {/* Badge SVG or Lock Icon */}
                      <div className="relative z-10 w-full h-full flex items-center justify-center">
                        {isEarned && svgPath ? (
                          <img 
                            src={svgPath} 
                            alt={badge.name}
                            className="w-full h-full"
                            style={{
                              filter: `drop-shadow(0 0 8px ${colors.glow})`,
                            }}
                          />
                        ) : (
                          <div 
                            className="w-full h-full rounded-full flex items-center justify-center"
                            style={{
                              background: 'oklch(0.18 0.03 250)',
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
                className="neon-card p-6 max-w-sm w-full relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close button */}
                <button 
                  onClick={() => setSelectedBadge(null)}
                  className="absolute top-4 right-4 text-[oklch(0.60_0.03_220)] hover:text-[oklch(0.80_0.03_220)]"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Badge Display */}
                <div className="flex flex-col items-center text-center">
                  {/* Large Badge */}
                  <div 
                    className={`w-32 h-32 rounded-full flex items-center justify-center relative mb-4 ${
                      selectedBadge.earned && showUnlockAnimation ? 'badge-unlock' : ''
                    }`}
                    style={selectedBadge.earned ? {
                      boxShadow: `0 0 40px ${rarityColors[selectedBadge.rarity]?.glow || rarityColors.common.glow}`,
                    } : {}}
                  >
                    {selectedBadge.earned && (
                      <div 
                        className="absolute inset-[-4px] rounded-full"
                        style={{
                          background: `linear-gradient(135deg, ${rarityColors[selectedBadge.rarity]?.border || rarityColors.common.border} 0%, ${rarityColors[selectedBadge.rarity]?.border || rarityColors.common.border}80 100%)`,
                          padding: '4px',
                          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                          WebkitMaskComposite: 'xor',
                          maskComposite: 'exclude',
                        }}
                      />
                    )}
                    
                    {selectedBadge.earned ? (
                      <img 
                        src={badgeSvgMap[getBadgeCode(selectedBadge.name)]} 
                        alt={selectedBadge.name}
                        className="w-full h-full"
                        style={{
                          filter: `drop-shadow(0 0 12px ${rarityColors[selectedBadge.rarity]?.glow || rarityColors.common.glow})`,
                        }}
                      />
                    ) : (
                      <div 
                        className="w-full h-full rounded-full flex items-center justify-center"
                        style={{ background: 'oklch(0.18 0.03 250)' }}
                      >
                        <Lock className="w-12 h-12 text-[oklch(0.40_0.02_250)]" />
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
                    className="text-xs font-medium px-3 py-1 rounded-full mb-3"
                    style={{
                      background: rarityColors[selectedBadge.rarity]?.bg || rarityColors.common.bg,
                      color: rarityColors[selectedBadge.rarity]?.text || rarityColors.common.text,
                    }}
                  >
                    {rarityLabels[selectedBadge.rarity] || "Comune"}
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
