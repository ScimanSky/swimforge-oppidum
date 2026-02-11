import { useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import { getSeasonAssignmentImageUrl } from "@/lib/seasonBadgeImages";
import { useBadgeNotifications, type BadgeNotificationItem } from "@/hooks/useBadgeNotifications";

type UnlockCandidate = BadgeNotificationItem & {
  key: string;
  unlockedAtMs: number;
};

const parseSeenSet = (raw: string | null): Set<string> => {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
};

const persistSeenSet = (storageKey: string, keys: Set<string>) => {
  localStorage.setItem(storageKey, JSON.stringify(Array.from(keys)));
};

const getUnlockedSeasonValue = (metric: string, seasonData: any): number => {
  if (metric === "seasonLevel") {
    return Number(seasonData?.progress?.currentLevel ?? 1);
  }
  return Number((seasonData?.seasonStats as Record<string, unknown> | undefined)?.[metric] ?? 0);
};

export default function BadgeUnlockWatcher() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ? String(user.id) : "";
  const { addBadges } = useBadgeNotifications();

  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const classicBadgesQuery = trpc.badges.userBadges.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const achievementBadgesQuery = trpc.badges.getUserAchievementBadges.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
  const seasonQuery = trpc.season.getCurrent.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const isDataReady =
    !classicBadgesQuery.isLoading &&
    !achievementBadgesQuery.isLoading &&
    !seasonQuery.isLoading;

  const notificationsEnabled = useMemo(() => {
    const raw = (profileQuery.data?.notificationSettings as Record<string, unknown> | undefined)?.badges;
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "string") return raw.toLowerCase() === "true";
    if (typeof raw === "number") return raw === 1;
    return true;
  }, [profileQuery.data?.notificationSettings]);

  const unlockedCandidates = useMemo<UnlockCandidate[]>(() => {
    const classicItems: UnlockCandidate[] = (classicBadgesQuery.data ?? []).map((entry: any) => {
      const badge = entry?.badge ?? {};
      const userBadge = entry?.userBadge ?? {};
      const id = Number(badge.id ?? userBadge.badgeId ?? userBadge.id ?? 0);
      const code = String(badge.code ?? `classic_${id}`);
      return {
        key: `classic:${id}`,
        id: `classic-${id}`,
        code,
        name: String(badge.name ?? "Badge sbloccato"),
        description: String(badge.description ?? "Hai ottenuto un nuovo badge."),
        image_url: getBadgeImageUrl(code),
        rarity: typeof badge.rarity === "string" ? badge.rarity : undefined,
        category: "classic",
        unlockedAtMs: Date.parse(String(userBadge.earnedAt ?? badge.createdAt ?? "")) || 0,
      };
    });

    const achievementItems: UnlockCandidate[] = (achievementBadgesQuery.data ?? []).map((entry: any) => {
      const definition = entry?.badge ?? {};
      const rowId = Number(entry?.id ?? 0);
      const badgeId = Number(entry?.badgeId ?? definition?.id ?? 0);
      const code = `achievement_${badgeId || rowId}`;
      return {
        key: `achievement:${badgeId || rowId}`,
        id: `achievement-${badgeId || rowId}`,
        code,
        name: String(definition?.name ?? "Achievement sbloccato"),
        description: String(definition?.description ?? "Hai ottenuto un nuovo achievement."),
        image_url: String(definition?.iconUrl ?? "/badges_new/oppidum_member.png"),
        category: "achievement",
        unlockedAtMs: Date.parse(String(entry?.awardedAt ?? "")) || 0,
      };
    });

    const seasonData = seasonQuery.data;
    const seasonItems: UnlockCandidate[] = (seasonData?.badgeAssignments ?? [])
      .filter((assignment: any) => {
        const target = Math.max(1, Number(assignment?.target ?? 1));
        const current = getUnlockedSeasonValue(String(assignment?.metric ?? ""), seasonData);
        return current >= target;
      })
      .map((assignment: any) => {
        const code = String(assignment?.code ?? "season_badge");
        return {
          key: `season:${code}`,
          id: `season-${code}`,
          code,
          name: String(assignment?.name ?? code),
          description: String(assignment?.objective ?? "Badge season sbloccato."),
          image_url: getSeasonAssignmentImageUrl(code),
          rarity: typeof assignment?.rarity === "string" ? assignment.rarity : undefined,
          category: "season",
          unlockedAtMs: 0,
        };
      });

    return [...classicItems, ...achievementItems, ...seasonItems].sort((a, b) => {
      if (a.unlockedAtMs !== b.unlockedAtMs) {
        // Keep deterministic order; unknown timestamps (0) are pushed after known dates.
        if (a.unlockedAtMs === 0) return 1;
        if (b.unlockedAtMs === 0) return -1;
        return a.unlockedAtMs - b.unlockedAtMs;
      }
      return a.name.localeCompare(b.name);
    });
  }, [achievementBadgesQuery.data, classicBadgesQuery.data, seasonQuery.data]);

  useEffect(() => {
    if (!isAuthenticated || !userId || !isDataReady) return;

    const seenStorageKey = `swimforge:badge-unlocks:seen:${userId}`;
    const bootStorageKey = `swimforge:badge-unlocks:boot:${userId}`;
    const seen = parseSeenSet(localStorage.getItem(seenStorageKey));
    const isBootstrapped = localStorage.getItem(bootStorageKey) === "1";

    const currentKeys = new Set(unlockedCandidates.map((candidate) => candidate.key));

    // First run for this user: establish baseline to avoid replaying old unlocks.
    if (!isBootstrapped) {
      persistSeenSet(seenStorageKey, currentKeys);
      localStorage.setItem(bootStorageKey, "1");
      return;
    }

    const newlyUnlocked = unlockedCandidates.filter((candidate) => !seen.has(candidate.key));
    if (!newlyUnlocked.length) return;

    newlyUnlocked.forEach((candidate) => seen.add(candidate.key));
    persistSeenSet(seenStorageKey, seen);

    if (!notificationsEnabled) return;

    addBadges(
      newlyUnlocked.map(({ key: _key, unlockedAtMs: _unlockedAtMs, ...badge }) => badge),
    );
  }, [addBadges, isAuthenticated, isDataReady, notificationsEnabled, unlockedCandidates, userId]);

  return null;
}

