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
  ChoiceGroup,
  type ChoiceOption,
} from "@/components/corsia/ChoiceGroup";
import { Skeleton } from "@/components/ui/skeleton";
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
import { getBadgeImageUrl } from "@/lib/badgeImages";
import {
  distanceParts,
  formatDayMonthYear,
  formatDurationParts,
  formatInteger,
  formatPaceValue,
  getInitials,
  NO_VALUE,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  activityDays,
  getActivityAvgSwolf,
  getStreaks,
  STREAK_EXPLANATION,
  STREAK_UNIT,
  primaryStrokeLabel,
} from "@/lib/profile-stats";
import { PersonalRecordsBoard } from "@/components/corsia/PersonalRecordsBoard";

const toTime = (value: unknown) => {
  if (!value) return 0;
  const time = new Date(value as string | Date).getTime();
  return Number.isFinite(time) ? time : 0;
};

/** Badges shown in the profile preview (the rest are on `/badges`). */
const BADGE_PREVIEW = 6;

type PreviewBadge = {
  key: string;
  name: string;
  imageUrl: string;
  earnedAt: number;
};

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
    <section
      aria-labelledby={titleId}
      className={cn("surface-panel p-4", className)}
      {...rest}
    >
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

type Theme = "dark" | "light";

const APPEARANCE_OPTIONS: ReadonlyArray<ChoiceOption<Theme>> = [
  {
    value: "dark",
    label: "Scuro",
    icon: <Moon className="size-5 text-muted-foreground" aria-hidden />,
  },
  {
    value: "light",
    label: "Chiaro",
    icon: <Sun className="size-5 text-muted-foreground" aria-hidden />,
  },
];

/** «Aspetto»: the only theme switch for signed-in users (native radios: arrows move the choice). */
function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="surface-panel p-4">
      <h2 id={titleId} className={sectionTitle}>
        Aspetto
      </h2>
      <ChoiceGroup
        aria-labelledby={titleId}
        options={APPEARANCE_OPTIONS}
        value={theme}
        onChange={value => setTheme?.(value)}
        disabled={!setTheme}
        className="mt-3 grid grid-cols-2 gap-3"
        optionClassName="h-14 gap-3 px-4"
      />
    </section>
  );
}

/** Placeholder of the header and level card while `profile.get` loads (the summary has its own). */
function ProfileSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Caricamento…</span>
      <div className="surface-panel space-y-4 p-4" aria-hidden>
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-40 rounded-2xl" aria-hidden />
    </div>
  );
}

export default function Profile() {
  const { data: me } = trpc.auth.me.useQuery();
  const profileQuery = trpc.profile.get.useQuery();
  const profile = profileQuery.data;
  const { data: activitiesData } = trpc.activities.list.useQuery({
    limit: 50,
    offset: 0,
    source: "all",
  });
  const badgesQuery = trpc.badges.progress.useQuery();
  const badgesData = badgesQuery.data;
  const { data: achievementDefinitions } =
    trpc.badges.getAchievementBadgeDefinitions.useQuery();
  const userAchievementQuery = trpc.badges.getUserAchievementBadges.useQuery();
  const userAchievementBadges = userAchievementQuery.data;
  const badgesLoading = badgesQuery.isLoading || userAchievementQuery.isLoading;

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
      .map(activity => getActivityAvgSwolf(activity))
      .filter(
        (value: number | null) => typeof value === "number" && value > 0
      ) as number[];
    const avgSwolf = swolfValues.length
      ? Math.round(
          swolfValues.reduce((sum, value) => sum + value, 0) /
            swolfValues.length
        )
      : null;
    const bestSwolf = swolfValues.length ? Math.min(...swolfValues) : null;

    const swimDays = activityDays(activities);
    const streaks = getStreaks(swimDays);

    return {
      totalDistance,
      totalTime,
      totalSessions,
      avgPace,
      avgSwolf,
      bestSwolf,
      hasActivities: swimDays.length > 0,
      streakCurrent: streaks.current,
      streakBest: streaks.best,
    };
  }, [activities, profile]);

  const primaryStroke = useMemo(
    () => primaryStrokeLabel(activities),
    [activities]
  );

  /** Earned badges (progress and achievement ones), newest first. */
  const earnedBadges = useMemo<PreviewBadge[]>(() => {
    const progressBadges = badgeProgress
      .filter(badge => badge.earned)
      .map(badge => ({
        key: `badge-${badge.id}`,
        name: String(badge.name ?? ""),
        imageUrl: getBadgeImageUrl(String(badge.code ?? "")),
        earnedAt: toTime(badge.earnedAt),
      }));
    const achievements = ((userAchievementBadges ?? []) as Array<any>).map(
      entry => ({
        key: `ach-${entry.badgeId}`,
        name: String(entry.badge?.name ?? ""),
        imageUrl: entry.badge?.iconUrl
          ? assetUrl(entry.badge.iconUrl)
          : getBadgeImageUrl(`achievement_${entry.badgeId}`),
        earnedAt: toTime(entry.awardedAt),
      })
    );
    return [...progressBadges, ...achievements].sort(
      (a, b) => b.earnedAt - a.earnedAt
    );
  }, [badgeProgress, userAchievementBadges]);
  const totalBadges =
    badgeProgress.length + (achievementDefinitions?.length ?? 0);
  const previewBadges = earnedBadges.slice(0, BADGE_PREVIEW);

  const followerCount = Number(
    (profile as { followerCount?: number } | undefined)?.followerCount ?? 0
  );
  const followingCount = Number(
    (profile as { followingCount?: number } | undefined)?.followingCount ?? 0
  );

  // A metric without data is left out (never a «—»). Lifetime totals come from the profile…
  const totals: MetricProps[] = [];
  totals.push({
    value: formatInteger(stats.totalSessions),
    label: "Sessioni totali",
  });
  if (stats.totalDistance > 0)
    totals.push({
      ...distanceParts(stats.totalDistance),
      label: "Distanza totale",
    });
  const totalTime = formatDurationParts(stats.totalTime);
  if (totalTime) totals.push({ ...totalTime, label: "Tempo totale" });
  if (stats.avgPace > 0 && Number.isFinite(stats.avgPace)) {
    totals.push({
      value: formatPaceValue(stats.avgPace),
      unit: "/100",
      label: "Passo medio",
      tone: "action",
    });
  }
  // …SWOLF and streaks from the last activities only (at most 50), shown under their own title.
  const recent: MetricProps[] = [];
  if (stats.avgSwolf)
    recent.push({ value: String(stats.avgSwolf), label: "SWOLF medio" });
  if (stats.bestSwolf)
    recent.push({
      value: String(Math.round(stats.bestSwolf)),
      label: "SWOLF migliore",
    });
  if (stats.hasActivities) {
    recent.push({
      value: String(stats.streakCurrent),
      unit: STREAK_UNIT,
      label: "Serie attuale",
    });
    recent.push({
      value: String(stats.streakBest),
      unit: STREAK_UNIT,
      label: "Serie migliore",
    });
  }
  const recentTitle =
    activities.length === 1
      ? "Ultima nuotata"
      : `Ultime ${activities.length} nuotate`;
  const recentTitleId = useId();
  const joined = profile?.createdAt
    ? formatDayMonthYear(profile.createdAt)
    : null;

  const nameId = useId();
  const profileBadgeName = profile?.profileBadge?.name;

  return (
    <AppLayout>
      <div className="max-w-3xl space-y-6">
        {profileQuery.isLoading ? (
          <ProfileSkeleton />
        ) : (
          <>
            <section
              aria-labelledby={nameId}
              className="surface-panel overflow-hidden"
            >
              {profile?.coverUrl ? (
                <img
                  src={profile.coverUrl}
                  alt=""
                  className="h-28 w-full object-cover sm:h-36"
                />
              ) : null}
              <div className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="size-16 border border-border">
                    <AvatarImage
                      src={profile?.avatarUrl || ""}
                      alt={displayName}
                    />
                    <AvatarFallback className="text-xl font-semibold">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <h2
                      id={nameId}
                      className="truncate font-display text-[30px] font-bold leading-tight"
                    >
                      {displayName}
                    </h2>
                    <p className="truncate text-sm text-muted-foreground">
                      {username}
                    </p>
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
                  {joined && joined !== NO_VALUE ? (
                    <li className="flex items-center gap-1.5">
                      <Calendar className="size-4" aria-hidden />
                      Iscritto dal {joined}
                    </li>
                  ) : null}
                  {primaryStroke ? (
                    <li className="flex items-center gap-1.5">
                      <Waves className="size-4" aria-hidden />
                      Stile principale: {primaryStroke}
                    </li>
                  ) : null}
                </ul>

                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
                  <p>
                    <span className="font-display text-xl font-bold tabular-nums">
                      {formatInteger(followerCount)}
                    </span>{" "}
                    <span className="text-sm text-muted-foreground">
                      Follower
                    </span>
                  </p>
                  <p>
                    <span className="font-display text-xl font-bold tabular-nums">
                      {formatInteger(followingCount)}
                    </span>{" "}
                    <span className="text-sm text-muted-foreground">
                      Seguiti
                    </span>
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
          </>
        )}

        <Section
          title="Badge"
          data-tour="badges-nav"
          aside={
            !badgesLoading && previewBadges.length > 0 ? (
              <div className="flex items-baseline gap-3">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatInteger(earnedBadges.length)} di{" "}
                  {formatInteger(totalBadges)}
                </span>
                <BadgesLink />
              </div>
            ) : null
          }
        >
          {badgesLoading ? (
            <div
              role="status"
              className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6"
            >
              <span className="sr-only">Caricamento dei badge…</span>
              {Array.from({ length: BADGE_PREVIEW }, (_, index) => (
                <Skeleton
                  key={index}
                  className="mx-auto size-12 rounded-full"
                  aria-hidden
                />
              ))}
            </div>
          ) : previewBadges.length > 0 ? (
            <ul
              aria-label="Badge recenti"
              className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6"
            >
              {previewBadges.map(badge => (
                <li
                  key={badge.key}
                  className="flex min-w-0 flex-col items-center gap-1.5 text-center"
                >
                  <img
                    src={badge.imageUrl}
                    alt={badge.name}
                    loading="lazy"
                    className="size-12 object-contain"
                  />
                  <span
                    aria-hidden="true"
                    className="line-clamp-2 text-xs font-medium"
                  >
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
          {profileQuery.isLoading ? (
            <div
              role="status"
              className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4"
            >
              <span className="sr-only">Caricamento del riepilogo…</span>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12" aria-hidden />
              ))}
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              {totals.map(metric => (
                <li key={metric.label}>
                  <Metric {...metric} />
                </li>
              ))}
            </ul>
          )}
          {recent.length > 0 ? (
            <section
              aria-labelledby={recentTitleId}
              className="mt-5 border-t border-border pt-4"
            >
              <h3
                id={recentTitleId}
                className="text-sm font-semibold text-muted-foreground"
              >
                {recentTitle}
              </h3>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
                {recent.map(metric => (
                  <li key={metric.label}>
                    <Metric {...metric} />
                  </li>
                ))}
              </ul>
              {stats.hasActivities ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  {STREAK_EXPLANATION}
                </p>
              ) : null}
            </section>
          ) : null}
        </Section>

        <PersonalRecordsBoard userId={Number(me?.id ?? 0)} />

        <nav aria-label="Altro">
          <ul className="surface-panel divide-y divide-border overflow-hidden">
            <li>
              <Link
                href="/profile/performance"
                className="flex h-14 items-center gap-3 px-4 font-semibold transition-colors hover:bg-raised"
              >
                <BarChart3
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex-1">Statistiche</span>
                <ChevronRight
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
            <li>
              <Link
                href="/settings"
                className="flex h-14 items-center gap-3 px-4 font-semibold transition-colors hover:bg-raised"
              >
                <Settings
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex-1">Impostazioni</span>
                <ChevronRight
                  className="size-5 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            </li>
          </ul>
        </nav>

        <AppearanceSection />
      </div>
    </AppLayout>
  );
}
