import { assetUrl } from "@/lib/asset-base";
import AppLayout from "@/components/AppLayout";
import { useId, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Chip } from "@/components/corsia/Chip";
import { LevelCard } from "@/components/corsia/LevelCard";
import { Metric, type MetricProps } from "@/components/corsia/Metric";
import {
  BarChart3,
  Calendar,
  ChevronRight,
  Edit,
  MapPin,
  Moon,
  Settings,
  Sun,
  Waves,
} from "lucide-react";
import { formatSwimCentiseconds } from "@/lib/swimTime";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import {
  distanceParts,
  formatDurationParts,
  formatInteger,
  formatPaceValue,
  getInitials,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/** «12 mar 2025»; «—» for a missing or invalid date. */
const formatDate = (date?: string | Date | null) => {
  if (!date) return "—";
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const parseActivityDate = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toTime = (value: unknown) => {
  if (!value) return 0;
  const time = new Date(value as string | Date).getTime();
  return Number.isFinite(time) ? time : 0;
};

const getActivityDateValue = (activity: any) =>
  activity?.activityDate ??
  activity?.activity_date ??
  activity?.createdAt ??
  activity?.created_at ??
  null;

const getActivityPace = (activity: any) =>
  toNumber(
    activity?.avgPacePer100m ??
      activity?.avg_pace_per_100m ??
      activity?.pacePer100m ??
      activity?.pace_per_100m ??
      0
  );

const getActivityAvgSwolf = (activity: any) =>
  toNumber(activity?.avgSwolf ?? activity?.avg_swolf ?? 0);

const getActivityStroke = (activity: any) =>
  activity?.strokeType ?? activity?.stroke_type ?? activity?.stroke ?? "mixed";

const getStreaks = (dates: string[]) => {
  if (dates.length === 0) return { current: 0, best: 0 };
  const uniqueDates = Array.from(new Set(dates)).sort();
  const dateSet = new Set(uniqueDates);
  const trainingDays = new Set([1, 3, 5]); // Mon/Wed/Fri

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trainingDates: string[] = [];
  for (let i = 0; i < 365; i += 1) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    if (trainingDays.has(checkDate.getDay())) {
      trainingDates.push(checkDate.toISOString().split("T")[0]);
    }
  }
  trainingDates.reverse();

  let best = 0;
  let temp = 0;
  for (const dateStr of trainingDates) {
    if (dateSet.has(dateStr)) {
      temp += 1;
      best = Math.max(best, temp);
    } else {
      temp = 0;
    }
  }

  let endIndex = trainingDates.length - 1;
  const todayStr = today.toISOString().split("T")[0];
  if (trainingDays.has(today.getDay()) && !dateSet.has(todayStr)) {
    endIndex -= 1;
  }
  let current = 0;
  for (let i = endIndex; i >= 0; i -= 1) {
    if (dateSet.has(trainingDates[i])) {
      current += 1;
    } else {
      break;
    }
  }

  return { current, best };
};

const strokeLabels: Record<string, string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misti",
};

const sourceLabels: Record<string, string> = {
  official: "Gara",
  training: "Allenamento",
};

/** Badges shown in the profile preview (the rest are on `/badges`). */
const BADGE_PREVIEW = 6;

type PreviewBadge = { key: string; name: string; imageUrl: string; earnedAt: number };

const sectionTitle = "text-[17px] font-bold";

function Section({
  title,
  aside,
  className,
  children,
  ...rest
}: {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
  "data-tour"?: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("surface-panel p-4", className)} {...rest}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className={sectionTitle}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function BadgesLink() {
  return (
    <Link
      href="/badges"
      className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-action-text hover:underline"
    >
      Vedi tutti<span className="sr-only"> i badge</span>
    </Link>
  );
}

const APPEARANCE_OPTIONS = [
  { value: "dark", label: "Scuro", icon: <Moon className="size-5 text-muted-foreground" aria-hidden /> },
  { value: "light", label: "Chiaro", icon: <Sun className="size-5 text-muted-foreground" aria-hidden /> },
] as const;

/** «Aspetto»: the only theme switch for signed-in users (native radios: arrows move the choice). */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="surface-panel p-4">
      <h2 id={titleId} className={sectionTitle}>
        Aspetto
      </h2>
      <div role="radiogroup" aria-labelledby={titleId} className="mt-3 grid grid-cols-2 gap-3">
        {APPEARANCE_OPTIONS.map(({ value, label, icon }) => (
          <label
            key={value}
            className="flex h-14 cursor-pointer items-center gap-3 rounded-xl border-2 border-border bg-raised px-4 font-semibold transition-colors has-[:checked]:border-action-text has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={theme === value}
              disabled={!setTheme}
              onChange={() => setTheme?.(value)}
              className="sr-only"
            />
            {icon}
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}

export default function Profile() {
  const { data: me } = trpc.auth.me.useQuery();
  const { data: profile } = trpc.profile.get.useQuery();
  const profileFinaGender = useMemo<"male" | "female">(() => {
    const raw = String((profile as any)?.gender ?? (profile as any)?.sex ?? "").trim().toLowerCase();
    if (raw === "female" || raw === "f" || raw === "woman" || raw === "donna") {
      return "female";
    }
    return "male";
  }, [profile]);
  const pbBoardQuery = trpc.records.getByUser.useQuery(
    { userId: Number(me?.id ?? 0), finaGender: profileFinaGender },
    { enabled: Number(me?.id ?? 0) > 0 }
  );
  const { data: activitiesData } = trpc.activities.list.useQuery({
    limit: 50,
    offset: 0,
    source: "all",
  });
  const { data: badgesData } = trpc.badges.progress.useQuery();
  const { data: achievementDefinitions } = trpc.badges.getAchievementBadgeDefinitions.useQuery();
  const { data: userAchievementBadges } = trpc.badges.getUserAchievementBadges.useQuery();

  const displayName =
    [me?.name, profile?.lastName].filter(Boolean).join(" ") ||
    profile?.username ||
    me?.email?.split("@")[0] ||
    "SwimForge";
  const username = profile?.username
    ? `@${profile.username.replace(/^@+/, "")}`
    : me?.email
      ? `@${me.email.split("@")[0]}`
      : "@swimforge";
  const bio = profile?.bio || "Aggiungi una bio dalle impostazioni.";
  const location = profile?.location || "Località non impostata";

  const activities = activitiesData ?? [];
  const badgeProgress = (badgesData ?? []) as Array<any>;

  const stats = useMemo(() => {
    const totalDistance = profile?.totalDistanceMeters ?? 0;
    const totalTime = profile?.totalTimeSeconds ?? 0;
    const totalSessions = profile?.totalSessions ?? 0;
    const avgPace = totalDistance > 0 ? totalTime / (totalDistance / 100) : 0;

    const swolfValues = activities
      .map((activity) => getActivityAvgSwolf(activity))
      .filter((value: number | null) => typeof value === "number" && value > 0) as number[];
    const avgSwolf = swolfValues.length
      ? Math.round(swolfValues.reduce((sum, value) => sum + value, 0) / swolfValues.length)
      : null;
    const bestSwolf = swolfValues.length ? Math.min(...swolfValues) : null;

    const dateList = activities
      .map((activity) => parseActivityDate(getActivityDateValue(activity)))
      .filter((value): value is Date => value instanceof Date)
      .map((date) => date.toISOString().split("T")[0])
      .filter(Boolean);
    const streaks = getStreaks(dateList);

    return {
      totalDistance,
      totalTime,
      totalSessions,
      avgPace,
      avgSwolf,
      bestSwolf,
      hasActivities: dateList.length > 0,
      streakCurrent: streaks.current,
      streakBest: streaks.best,
    };
  }, [activities, profile]);

  const primaryStroke = useMemo(() => {
    if (!activities.length) return "Non disponibile";
    const counts: Record<string, number> = {};
    activities.forEach((activity) => {
      const stroke = getActivityStroke(activity) || "mixed";
      counts[stroke] = (counts[stroke] || 0) + 1;
    });
    const [top] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return strokeLabels[top?.[0]] || "Misto";
  }, [activities]);

  const pbRows = useMemo(() => {
    const rows = ((pbBoardQuery.data as any)?.records as Array<any> | undefined) ?? [];
    return rows.slice(0, 24);
  }, [pbBoardQuery.data]);

  /** Earned badges (progress and achievement ones), newest first. */
  const earnedBadges = useMemo<PreviewBadge[]>(() => {
    const progressBadges = badgeProgress
      .filter((badge) => badge.earned)
      .map((badge) => ({
        key: `badge-${badge.id}`,
        name: String(badge.name ?? ""),
        imageUrl: getBadgeImageUrl(String(badge.code ?? "")),
        earnedAt: toTime(badge.earnedAt),
      }));
    const achievements = ((userAchievementBadges ?? []) as Array<any>).map((entry) => ({
      key: `ach-${entry.badgeId}`,
      name: String(entry.badge?.name ?? ""),
      imageUrl: entry.badge?.iconUrl
        ? assetUrl(entry.badge.iconUrl)
        : getBadgeImageUrl(`achievement_${entry.badgeId}`),
      earnedAt: toTime(entry.awardedAt),
    }));
    return [...progressBadges, ...achievements].sort((a, b) => b.earnedAt - a.earnedAt);
  }, [badgeProgress, userAchievementBadges]);
  const totalBadges = badgeProgress.length + (achievementDefinitions?.length ?? 0);
  const previewBadges = earnedBadges.slice(0, BADGE_PREVIEW);

  const followerCount = Number((profile as { followerCount?: number } | undefined)?.followerCount ?? 0);
  const followingCount = Number((profile as { followingCount?: number } | undefined)?.followingCount ?? 0);

  // A metric without data is left out (never a «—»).
  const metrics: MetricProps[] = [];
  metrics.push({ value: formatInteger(stats.totalSessions), label: "Sessioni totali" });
  if (stats.totalDistance > 0) metrics.push({ ...distanceParts(stats.totalDistance), label: "Distanza totale" });
  const totalTime = formatDurationParts(stats.totalTime);
  if (totalTime) metrics.push({ ...totalTime, label: "Tempo totale" });
  if (stats.avgPace > 0 && Number.isFinite(stats.avgPace)) {
    metrics.push({ value: formatPaceValue(stats.avgPace), unit: "/100", label: "Passo medio", tone: "action" });
  }
  if (stats.avgSwolf) metrics.push({ value: String(stats.avgSwolf), label: "SWOLF medio" });
  if (stats.bestSwolf) metrics.push({ value: String(Math.round(stats.bestSwolf)), label: "SWOLF migliore" });
  if (stats.hasActivities) {
    metrics.push({ value: String(stats.streakCurrent), unit: "g", label: "Serie attuale" });
    metrics.push({ value: String(stats.streakBest), unit: "g", label: "Serie migliore" });
  }

  const nameId = useId();
  const profileBadgeName = profile?.profileBadge?.name;

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        <section aria-labelledby={nameId} className="surface-panel overflow-hidden">
          {profile?.coverUrl ? (
            <img src={profile.coverUrl} alt="" className="h-28 w-full object-cover sm:h-36" />
          ) : null}
          <div className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16 border border-border">
                <AvatarImage src={profile?.avatarUrl || ""} alt={displayName} />
                <AvatarFallback className="text-xl font-semibold">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 id={nameId} className="truncate font-display text-[30px] font-bold leading-tight">
                  {displayName}
                </h2>
                <p className="truncate text-sm text-muted-foreground">{username}</p>
              </div>
            </div>

            {profileBadgeName ? (
              <div className="mt-3">
                <Chip>{profileBadgeName}</Chip>
              </div>
            ) : null}

            <p className="mt-3 text-[15px]">{bio}</p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {location}
              </li>
              <li className="flex items-center gap-1.5">
                <Calendar className="size-4" aria-hidden />
                Iscritto dal {formatDate(profile?.createdAt)}
              </li>
              <li className="flex items-center gap-1.5">
                <Waves className="size-4" aria-hidden />
                {primaryStroke}
              </li>
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
              <p>
                <span className="font-display text-xl font-bold tabular-nums">{formatInteger(followerCount)}</span>{" "}
                <span className="text-sm text-muted-foreground">Follower</span>
              </p>
              <p>
                <span className="font-display text-xl font-bold tabular-nums">{formatInteger(followingCount)}</span>{" "}
                <span className="text-sm text-muted-foreground">Seguiti</span>
              </p>
              <Button asChild variant="outline" className="ml-auto">
                <Link href="/settings">
                  <Edit className="size-4" aria-hidden />
                  Modifica profilo
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {profile && typeof profile.level === "number" ? (
          <LevelCard
            level={profile.level}
            totalXp={profile.totalXp ?? 0}
            currentLevelXp={profile.currentLevelXp ?? 0}
            nextLevelXp={profile.nextLevelXp ?? null}
            xpToNextLevel={profile.xpToNextLevel ?? 0}
          />
        ) : null}

        <Section
          title="Badge"
          data-tour="badges-nav"
          aside={
            previewBadges.length > 0 ? (
              <div className="flex items-baseline gap-3">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatInteger(earnedBadges.length)} di {formatInteger(totalBadges)}
                </span>
                <BadgesLink />
              </div>
            ) : null
          }
        >
          {previewBadges.length > 0 ? (
            <ul aria-label="Badge recenti" className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {previewBadges.map((badge) => (
                <li key={badge.key} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                  <img src={badge.imageUrl} alt={badge.name} loading="lazy" className="size-12 object-contain" />
                  <span aria-hidden="true" className="line-clamp-2 text-xs font-medium">
                    {badge.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Ancora nessun badge · <BadgesLink />
            </p>
          )}
        </Section>

        <Section title="Riepilogo" data-tour="profile-stats">
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            {metrics.map((metric) => (
              <li key={metric.label}>
                <Metric {...metric} />
              </li>
            ))}
          </ul>
        </Section>

        <Section
          title="Record personali"
          aside={<Chip>FINA {profileFinaGender === "female" ? "F" : "M"}</Chip>}
        >
          <div className="mt-3">
            {pbBoardQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Caricamento dei record…</p>
            ) : pbRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ancora nessun record personale.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {pbRows.map((row: any) => (
                  <li key={row.id} className="rounded-xl bg-raised p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {strokeLabels[String(row.strokeType)] ?? "Stile"} {Number(row.distanceMeters)} m
                      </p>
                      <span className="text-xs text-muted-foreground">Vasca {Number(row.poolLengthMeters)} m</span>
                    </div>
                    <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {formatSwimCentiseconds(row.timeCs)}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {sourceLabels[String(row.source)] ?? "Record"}
                        {Number.isFinite(Number(row.finaPoints)) && row.finaPoints !== null
                          ? ` · ${Math.round(Number(row.finaPoints))} punti FINA`
                          : ""}
                      </span>
                      <span>{formatDate(row.achievedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <nav aria-label="Altro">
          <ul className="surface-panel divide-y divide-border overflow-hidden">
            <li>
              <Link
                href="/profile/performance"
                className="flex h-14 items-center gap-3 px-4 font-semibold transition-colors hover:bg-raised"
              >
                <BarChart3 className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Statistiche</span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="flex h-14 items-center gap-3 px-4 font-semibold transition-colors hover:bg-raised"
              >
                <Settings className="size-5 text-muted-foreground" aria-hidden />
                <span className="flex-1">Impostazioni</span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          </ul>
        </nav>

        <AppearanceSection />
      </div>
    </AppLayout>
  );
}
