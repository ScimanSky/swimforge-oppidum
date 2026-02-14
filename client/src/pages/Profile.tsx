import AppLayout from "@/components/AppLayout";
import { useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { getBadgeImageUrl } from "@/lib/badgeImages";
import { Surface, SurfaceContent, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricOrb } from "@/components/metrics/MetricOrb";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Calendar,
  Droplets,
  Edit,
  Flame,
  MapPin,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Award,
  Waves,
  Zap,
} from "lucide-react";

const formatDistance = (meters?: number | null) => {
  if (!meters) return "—";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

const formatTime = (seconds?: number | null) => {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} min`;
};

const formatPace = (secondsPer100m?: number | null) => {
  if (!secondsPer100m || !Number.isFinite(secondsPer100m)) return "—";
  const minutes = Math.floor(secondsPer100m / 60);
  const seconds = Math.round(secondsPer100m % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/100m`;
};

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

const getActivityDateValue = (activity: any) =>
  activity?.activityDate ??
  activity?.activity_date ??
  activity?.createdAt ??
  activity?.created_at ??
  null;

const getActivityDistance = (activity: any) =>
  toNumber(activity?.distanceMeters ?? activity?.distance_meters ?? activity?.distance ?? 0);

const getActivityDuration = (activity: any) =>
  toNumber(
    activity?.durationSeconds ??
      activity?.duration_seconds ??
      activity?.movingDuration ??
      activity?.moving_duration ??
      activity?.elapsedDuration ??
      activity?.elapsed_duration ??
      activity?.duration ??
      0
  );

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

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SF";

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
  freestyle: "Stile Libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misto",
};

interface StatItemProps {
  label: string;
  value: string | number;
  progress: number;
  icon: React.ReactNode;
  helper?: string;
  tone?: "cyan" | "lime" | "sky" | "amber";
}

interface BadgeCardProps {
  title: string;
  description: string;
  imageUrl: string | null;
  unlocked: boolean;
  rarity: string;
}

function BadgeCard({ title, description, imageUrl, unlocked, rarity }: BadgeCardProps) {
  const rarityColors: Record<string, string> = {
    common: "bg-muted/60 text-muted-foreground",
    uncommon: "bg-emerald-500/10 text-emerald-400",
    rare: "bg-sky-500/10 text-sky-300",
    epic: "bg-purple-500/10 text-purple-300",
    legendary: "bg-amber-500/10 text-amber-300",
  };

  return (
    <div
      className={`flex items-center gap-4 rounded-lg border p-4 ${
        unlocked ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30 opacity-70"
      }`}
    >
      <div
        className={`flex size-12 items-center justify-center rounded-full ${
          unlocked ? "bg-primary/15" : "bg-muted"
        }`}
      >
        {unlocked ? (
          imageUrl ? (
            <img src={imageUrl} alt={title} className="size-9 object-contain" />
          ) : (
            <Waves className="size-5 text-primary" />
          )
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">?</span>
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground">{title}</p>
          <Badge className={rarityColors[rarity] || rarityColors.common}>{rarity}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {unlocked && (
        <Badge variant="neon" className="shrink-0">
          Sbloccato
        </Badge>
      )}
    </div>
  );
}

interface ActivityItemProps {
  type: string;
  date: string;
  duration: string;
  distance: string;
  pace: string;
}

function ActivityItem({ type, date, duration, distance, pace }: ActivityItemProps) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
          {type === "Piscina" ? (
            <Waves className="size-5 text-primary" />
          ) : (
            <Droplets className="size-5 text-primary" />
          )}
        </div>
        <div>
          <p className="font-medium text-foreground">{type}</p>
          <p className="text-sm text-muted-foreground">{date}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <p className="text-sm font-medium text-foreground">{distance}</p>
          <p className="text-xs text-muted-foreground">Distanza</p>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{duration}</p>
          <p className="text-xs text-muted-foreground">Tempo</p>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{pace}</p>
          <p className="text-xs text-muted-foreground">Pace</p>
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { data: me } = trpc.auth.me.useQuery();
  const { data: profile } = trpc.profile.get.useQuery();
  const { data: activitiesData } = trpc.activities.list.useQuery({
    limit: 50,
    offset: 0,
    source: "all",
  });
  const { data: badgesData } = trpc.badges.progress.useQuery();

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

    const paceValues = activities
      .map((activity) => getActivityPace(activity))
      .filter((value: number | null) => typeof value === "number" && value > 0) as number[];
    const bestPace = paceValues.length
      ? paceValues.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY)
      : null;

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
      bestPace: bestPace !== null && Number.isFinite(bestPace) ? bestPace : null,
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

  const recentActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => {
        const aDate = parseActivityDate(getActivityDateValue(a));
        const bDate = parseActivityDate(getActivityDateValue(b));
        return (bDate?.getTime() ?? 0) - (aDate?.getTime() ?? 0);
      })
      .slice(0, 4)
      .map((activity) => ({
      id: activity.id,
      type: activity.isOpenWater ? "Acque libere" : "Piscina",
      date: formatDate(parseActivityDate(getActivityDateValue(activity))),
      duration: formatTime(getActivityDuration(activity)),
      distance: formatDistance(getActivityDistance(activity)),
      pace: formatPace(getActivityPace(activity)),
    }));
  }, [activities]);

  const records = useMemo(() => {
    if (!activities.length) return [] as Array<{ label: string; value: string; date: string }>;

    const longest = activities.reduce(
      (max: any, activity: any) => {
        if (!max) return activity;
        return getActivityDistance(activity) > getActivityDistance(max) ? activity : max;
      },
      null
    );

    const paceCandidates = activities.filter((activity) => getActivityPace(activity) > 0);
    const fastestPaceActivity = paceCandidates.reduce((min, activity) => {
      if (!min) return activity;
      return getActivityPace(activity) < getActivityPace(min)
        ? activity
        : min;
    }, paceCandidates[0] ?? null);

    const swolfCandidates = activities.filter((activity) => getActivityAvgSwolf(activity) > 0);
    const bestSwolfActivity = swolfCandidates.reduce((min, activity) => {
      if (!min) return activity;
      return getActivityAvgSwolf(activity) < getActivityAvgSwolf(min)
        ? activity
        : min;
    }, swolfCandidates[0] ?? null);

    const longestDuration = activities.reduce(
      (max: any, activity: any) => {
        if (!max) return activity;
        return getActivityDuration(activity) > getActivityDuration(max) ? activity : max;
      },
      null
    );

    return [
      {
        label: "Sessione più lunga",
        value: formatDistance(longest ? getActivityDistance(longest) : null),
        date: formatDate(parseActivityDate(getActivityDateValue(longest))),
      },
      {
        label: "Pace migliore",
        value: formatPace(fastestPaceActivity ? getActivityPace(fastestPaceActivity) : null),
        date: formatDate(parseActivityDate(getActivityDateValue(fastestPaceActivity))),
      },
      {
        label: "SWOLF migliore",
        value: bestSwolfActivity ? `${Math.round(getActivityAvgSwolf(bestSwolfActivity))}` : "—",
        date: formatDate(parseActivityDate(getActivityDateValue(bestSwolfActivity))),
      },
      {
        label: "Durata record",
        value: formatTime(longestDuration ? getActivityDuration(longestDuration) : null),
        date: formatDate(parseActivityDate(getActivityDateValue(longestDuration))),
      },
    ];
  }, [activities]);

  const unlockedBadges = badgeProgress.filter((badge) => badge.earned).length;
  const levelProgress = profile?.nextLevelXp
    ? Math.min(100, ((profile.totalXp ?? 0) / profile.nextLevelXp) * 100)
    : 0;
  const profileOrbs: StatItemProps[] = [
    {
      label: "Sessioni totali",
      value: stats.totalSessions,
      progress: Math.min(100, Math.round((stats.totalSessions / 120) * 100)),
      icon: <TrendingUp className="size-4" />,
      helper: "Carriera",
      tone: "cyan",
    },
    {
      label: "Distanza totale",
      value: formatDistance(stats.totalDistance),
      progress: Math.min(100, Math.round((stats.totalDistance / 200000) * 100)),
      icon: <Waves className="size-4" />,
      helper: "Volume",
      tone: "sky",
    },
    {
      label: "Pace medio",
      value: formatPace(stats.avgPace),
      progress: stats.avgPace ? Math.min(100, Math.round((220 / Math.max(stats.avgPace, 1)) * 100)) : 0,
      icon: <Timer className="size-4" />,
      helper: "Efficienza",
      tone: "amber",
    },
    {
      label: "SWOLF medio",
      value: stats.avgSwolf ?? "—",
      progress: stats.avgSwolf ? Math.min(100, Math.round((70 / Math.max(stats.avgSwolf, 1)) * 100)) : 0,
      icon: <Target className="size-4" />,
      helper: "Tecnica",
      tone: "lime",
    },
    {
      label: "Tempo totale",
      value: formatTime(stats.totalTime),
      progress: Math.min(100, Math.round((stats.totalTime / 50000) * 100)),
      icon: <Calendar className="size-4" />,
      helper: "In acqua",
      tone: "cyan",
    },
    {
      label: "Best SWOLF",
      value: stats.bestSwolf ?? "—",
      progress: stats.bestSwolf ? Math.min(100, Math.round((70 / Math.max(stats.bestSwolf, 1)) * 100)) : 0,
      icon: <Award className="size-4" />,
      helper: stats.bestSwolf ? "Record personale" : "Nessun record",
      tone: "lime",
    },
    {
      label: "Streak attuale",
      value: `${stats.streakCurrent}g`,
      progress: Math.min(100, Math.round((stats.streakCurrent / 21) * 100)),
      icon: <Flame className="size-4" />,
      helper: "Continuita",
      tone: "amber",
    },
    {
      label: "Streak migliore",
      value: `${stats.streakBest}g`,
      progress: Math.min(100, Math.round((stats.streakBest / 30) * 100)),
      icon: <Trophy className="size-4" />,
      helper: "Record",
      tone: "sky",
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6 lg:space-y-3">
        <div className="grid gap-6 xl:grid-cols-12">
          <Surface className="bg-card border-border xl:col-span-7 glass-panel">
          <div className="relative h-36 overflow-hidden rounded-t-lg bg-muted">
            {profile?.coverUrl ? (
              <img
                src={profile.coverUrl}
                alt="Cover profilo"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nessuna cover caricata
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
          </div>
          <SurfaceContent className="pt-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <Avatar className="size-24 border border-border">
                <AvatarImage src={profile?.avatarUrl || ""} alt={displayName} />
                <AvatarFallback className="text-2xl">{getInitials(displayName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold neon-gradient-text">{displayName}</h1>
                      <Badge variant="neon" className="gap-1">
                        <Zap className="size-3" />
                        Livello {profile?.level ?? 1}
                      </Badge>
                      {profile?.profileBadge?.name && (
                        <Badge variant="outline" className="border-primary/40 text-primary">
                          {profile.profileBadge.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">{username}</p>
                  </div>
                  <Link href="/settings">
                    <Button variant="outline-neon">
                      <Edit className="mr-2 size-4" />
                      Modifica profilo
                    </Button>
                  </Link>
                </div>
                <p className="mt-3 text-foreground">{bio}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground sm:justify-start">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-4" />
                    {location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="size-4" />
                    Iscritto {formatDate(profile?.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Waves className="size-4" />
                    {primaryStroke}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground sm:justify-start">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">—</p>
                    <p>Following</p>
                    <p className="text-xs text-muted-foreground">In arrivo</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">—</p>
                    <p>Follower</p>
                    <p className="text-xs text-muted-foreground">In arrivo</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">
                      {unlockedBadges}/{badgeProgress.length || 0}
                    </p>
                    <p>Badge</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-lg border border-border bg-background/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {profile?.level ?? 1}
                  </div>
                  <span className="font-medium text-foreground">
                    Livello {profile?.level ?? 1}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {(profile?.totalXp ?? 0).toLocaleString()} / {(profile?.nextLevelXp ?? 0).toLocaleString()} XP
                </span>
              </div>
              <Progress value={levelProgress} className="mt-3 h-2" />
              <p className="mt-2 text-xs text-muted-foreground">
                {profile?.nextLevelXp
                  ? `${Math.max(profile.nextLevelXp - (profile.totalXp ?? 0), 0)} XP al livello ${
                      (profile.level ?? 1) + 1
                    }`
                  : ""}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/badges">Badge</Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/track">Attività recenti</Link>
                </Button>
                <Button variant="outline-neon" size="sm" asChild>
                  <Link href="/statistics">Record e progressi</Link>
                </Button>
              </div>
            </div>
          </SurfaceContent>
          </Surface>

          <Surface className="bg-card border-border xl:col-span-5">
            <SurfaceHeader>
              <SurfaceTitle className="font-display">Snapshot performance</SurfaceTitle>
            </SurfaceHeader>
            <SurfaceContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {profileOrbs.map((metric) => (
                  <MetricOrb
                    key={metric.label}
                    label={metric.label}
                    value={metric.value}
                    progress={metric.progress}
                    helper={metric.helper}
                    icon={metric.icon}
                    tone={metric.tone}
                    size="sm"
                  />
                ))}
              </div>
            </SurfaceContent>
          </Surface>
        </div>

      </div>
    </AppLayout>
  );
}
