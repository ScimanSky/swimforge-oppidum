import { assetUrl } from "@/lib/asset-base";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chip } from "@/components/corsia/Chip";
import { Metric } from "@/components/corsia/Metric";
import { Pager } from "@/components/corsia/Pager";
import { Lock } from "lucide-react";
import { Redirect } from "wouter";
import { useState, useRef, useCallback, useMemo, useEffect, useId } from "react";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import { AppLayout } from "@/components/AppLayout";
import { formatDayMonthYear, formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";

const categoryLabels: Record<string, string> = {
  all: "Tutti",
  distance: "Distanza",
  session: "Nuotata",
  consistency: "Costanza",
  open_water: "Acque libere",
  special: "Speciali",
  milestone: "Traguardi",
  achievement: "Imprese",
};

const rarityLabels: Record<string, string> = {
  common: "Comune",
  uncommon: "Non comune",
  rare: "Raro",
  epic: "Epico",
  legendary: "Leggendario",
};

const kmFormat = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** API image when present, otherwise the bundled one; both via `assetUrl` (the website in the app). */
const badgeImage = (badge: any) =>
  assetUrl(
    (typeof badge?.image_url === "string" && badge.image_url ? badge.image_url : null) ||
      getBadgeImageUrl(badge?.code)
  );

/** A locked badge: padlock on a dashed raised disc (the artwork stays a surprise). */
function LockedBadge({ className, iconClassName }: { className: string; iconClassName: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border-2 border-dashed border-border bg-raised",
        className
      )}
    >
      <Lock className={cn("text-muted-foreground", iconClassName)} aria-hidden />
    </span>
  );
}

export default function Badges() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const titleId = useId();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBadge, setSelectedBadge] = useState<any | null>(null);
  const [badgePage, setBadgePage] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: badgeProgress, isLoading } = trpc.badges.progress.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const { data: achievementDefinitions, isLoading: achievementsLoading } =
    trpc.badges.getAchievementBadgeDefinitions.useQuery(undefined, { enabled: isAuthenticated });
  const { data: userAchievementBadges } =
    trpc.badges.getUserAchievementBadges.useQuery(undefined, { enabled: isAuthenticated });

  const achievementBadges = useMemo(() => {
    if (!achievementDefinitions) return [];
    const earnedById = new Map(
      (userAchievementBadges || []).map((entry: any) => [entry.badgeId, entry])
    );
    return achievementDefinitions.map((def: any) => {
      const earnedEntry = earnedById.get(def.id);
      return {
        id: `ach-${def.id}`,
        code: `achievement_${def.id}`,
        name: def.name,
        description: def.description,
        category: "achievement",
        rarity: "uncommon",
        requirementType: "manual",
        requirementValue: 1,
        earned: Boolean(earnedEntry),
        progress: earnedEntry ? 100 : 0,
        earnedAt: earnedEntry?.awardedAt,
        image_url: def.iconUrl,
      };
    });
  }, [achievementDefinitions, userAchievementBadges]);

  const allBadges = useMemo(() => {
    return [...(badgeProgress || []), ...achievementBadges];
  }, [badgeProgress, achievementBadges]);

  // Filter badges by category
  const filteredBadges = allBadges.filter(
    (b) => selectedCategory === "all" || b.category === selectedCategory
  );
  const badgePageSize = 10;
  const badgeTotalPages = Math.max(1, Math.ceil(filteredBadges.length / badgePageSize));
  const pagedBadges = useMemo(() => {
    const start = (badgePage - 1) * badgePageSize;
    return filteredBadges.slice(start, start + badgePageSize);
  }, [filteredBadges, badgePage]);

  // Count earned badges
  const earnedCount = allBadges.filter((b) => b.earned).length || 0;
  const totalCount = allBadges.length || 0;
  const collectionPercent = Math.round((earnedCount / Math.max(totalCount, 1)) * 100);

  const soundBasePath = "/sounds/badges_new";
  const badgeSounds = [
    "2vbt055jjna-splash-sfx-4.mp3",
    "bathwater-splash-large-betacut-1-00-02.mp3",
    "jep7k98gxvq-splash-sfx-3.mp3",
    "mixkit-fish-flapping-2457.wav",
    "mixkit-gore-video-game-blood-splash-263.wav",
    "mixkit-jump-into-the-water-1180.wav",
    "mixkit-sea-water-splash-1198.wav",
    "mixkit-water-drop-splashes-in-cave-3179.wav",
    "mixkit-water-splash-1311.wav",
    "sgq1v8w7cp-splash-sfx-6.mp3",
    "splash-small-rock-thrown-in-water-mechanical-wave-14-00-01.mp3",
    "whoosh-water-betacut-1-00-03.mp3",
  ];

  // Get sound URL based on badge number (stable rotation)
  const getBadgeSoundUrl = useCallback((badgeNumber: number): string => {
    if (!badgeSounds.length) return "";
    const safeIndex = (Math.max(badgeNumber, 1) - 1) % badgeSounds.length;
    return `${soundBasePath}/${badgeSounds[safeIndex]}`;
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
      playSound(getBadgeSoundUrl(badgeIndex + 1));
    }
  };

  useEffect(() => {
    setBadgePage(1);
  }, [selectedCategory]);

  useEffect(() => {
    if (badgePage > badgeTotalPages) setBadgePage(badgeTotalPages);
  }, [badgePage, badgeTotalPages]);

  // After every hook: an early return between hooks breaks the rules of hooks.
  if (!authLoading && !isAuthenticated) {
    return <Redirect to="/" />;
  }

  const loading = isLoading || achievementsLoading;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Hidden audio element for badge sounds (dynamic source) */}
        <audio ref={audioRef} preload="auto" />

        <section aria-labelledby={titleId} className="surface-panel p-4">
          <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
            Collezione
          </h2>
          <div className="mt-2 flex items-end justify-between gap-4">
            <Metric
              size="lg"
              value={formatInteger(earnedCount)}
              unit={`di ${formatInteger(totalCount)}`}
              label="Badge sbloccati"
            />
            <span className="font-display text-[28px] font-bold leading-none tabular-nums">
              {collectionPercent}%
            </span>
          </div>
          <Progress value={collectionPercent} className="mt-4 h-2" aria-label="Collezione completata" />
        </section>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList aria-label="Categoria">
            {Object.entries(categoryLabels).map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div role="status" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <span className="sr-only">Caricamento dei badge…</span>
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" aria-hidden />
            ))}
          </div>
        ) : filteredBadges.length === 0 ? (
          <p className="surface-panel p-4 text-sm text-muted-foreground">
            Nessun badge in questa categoria.
          </p>
        ) : (
          <ul aria-label="Badge" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {pagedBadges.map((badge, index) => {
              const isEarned = Boolean(badge.earned);
              const position = allBadges.indexOf(badge);
              return (
                <li key={badge.id}>
                  <button
                    type="button"
                    onClick={() => handleBadgeClick(badge, position >= 0 ? position : index)}
                    aria-label={isEarned ? badge.name : `${badge.name}, da sbloccare`}
                    className="flex h-full w-full flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span className="flex size-24 items-center justify-center">
                      {isEarned ? (
                        <img
                          src={badgeImage(badge)}
                          alt=""
                          loading="lazy"
                          draggable={false}
                          onContextMenu={(e) => e.preventDefault()}
                          className="size-full select-none object-contain"
                        />
                      ) : (
                        <LockedBadge className="size-16" iconClassName="size-7" />
                      )}
                    </span>
                    <span
                      className={cn(
                        "line-clamp-2 text-sm font-semibold leading-tight",
                        isEarned ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {badge.name}
                    </span>
                    {!isEarned && badge.progress > 0 ? (
                      <Progress value={badge.progress} className="h-1.5 w-16" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!loading ? (
          <Pager page={badgePage} totalPages={badgeTotalPages} onChange={setBadgePage} label="Pagine dei badge" />
        ) : null}

        <Dialog open={selectedBadge != null} onOpenChange={(open) => !open && setSelectedBadge(null)}>
          {selectedBadge ? (
            <DialogContent className="max-w-sm">
              <DialogHeader className="items-center text-center sm:text-center">
                <span className="mb-2 flex size-40 items-center justify-center">
                  {selectedBadge.earned ? (
                    <img
                      src={badgeImage(selectedBadge)}
                      alt=""
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      className="size-full select-none object-contain"
                    />
                  ) : (
                    <LockedBadge className="size-28" iconClassName="size-12" />
                  )}
                </span>
                <DialogTitle className="text-xl font-bold">{selectedBadge.name}</DialogTitle>
                <Chip tone={selectedBadge.rarity === "legendary" ? "xp" : "neutral"}>
                  {rarityLabels[selectedBadge.rarity] || "Comune"}
                </Chip>
                <DialogDescription>{selectedBadge.description}</DialogDescription>
              </DialogHeader>
              {selectedBadge.requirementType === "single_session_distance_km" &&
              typeof selectedBadge.bestSessionKm === "number" ? (
                <p className="text-center text-sm text-muted-foreground">
                  Miglior nuotata: {kmFormat.format(selectedBadge.bestSessionKm)} km
                </p>
              ) : null}
              {selectedBadge.earned ? (
                selectedBadge.earnedAt ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Sbloccato il {formatDayMonthYear(selectedBadge.earnedAt)}
                  </p>
                ) : null
              ) : (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Progresso</span>
                    <span className="font-display text-lg font-bold tabular-nums">
                      {Math.round(Number(selectedBadge.progress) || 0)}%
                    </span>
                  </div>
                  <Progress
                    value={Number(selectedBadge.progress) || 0}
                    className="h-2"
                    aria-label={`Progresso: ${selectedBadge.name}`}
                  />
                </div>
              )}
            </DialogContent>
          ) : null}
        </Dialog>
      </div>
    </AppLayout>
  );
}
