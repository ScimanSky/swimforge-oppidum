import { and, eq, gte, lte, sql, desc, asc } from "drizzle-orm";
import { getDb } from "./db";
import {
  xpReasonEnum,
  swimmerProfiles,
  swimmingActivities,
  users,
  xpTransactions,
  socialPosts,
  socialComments,
  postReactions,
  eventAttendees,
  communityClubMembers,
} from "../drizzle/schema";

const SEASON_DURATION_DAYS = 56;
const LEVEL_CAP = 40;
const SEASON_ANCHOR_UTC = Date.UTC(2026, 0, 5, 0, 0, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

type MissionMetricName =
  | "sessions"
  | "strokeVariety"
  | "socialActions"
  | "eventRsvps"
  | "cadenceControlSessions"
  | "zoneBalanceDays";

type MissionTemplate = {
  id: string;
  kind: "daily" | "weekly";
  title: string;
  description: string;
  target: number;
  metric: MissionMetricName;
  xpReward: number;
};

type MissionBlueprint = Omit<MissionTemplate, "target"> & { baseTarget: number };

const DAILY_MISSION_POOL: Record<string, MissionBlueprint> = {
  cadence: {
    id: "daily-cadence-window",
    kind: "daily",
    title: "Finestra Cadenza",
    description: "Completa una sessione con cadenza tecnica controllata",
    baseTarget: 1,
    metric: "cadenceControlSessions",
    xpReward: 60,
  },
  zone: {
    id: "daily-zone-balance",
    kind: "daily",
    title: "Bilanciamento Zone",
    description: "Chiudi una sessione con equilibrio aerobico + picco intenso",
    baseTarget: 1,
    metric: "zoneBalanceDays",
    xpReward: 55,
  },
  community: {
    id: "daily-community-touch",
    kind: "daily",
    title: "Segnale al Team",
    description: "Fai almeno 1 azione social nel feed",
    baseTarget: 1,
    metric: "socialActions",
    xpReward: 50,
  },
  active: {
    id: "daily-active-day",
    kind: "daily",
    title: "Presenza Quotidiana",
    description: "Completa almeno una sessione oggi",
    baseTarget: 1,
    metric: "sessions",
    xpReward: 45,
  },
};

const WEEKLY_MISSION_POOL: Record<string, MissionBlueprint> = {
  stroke: {
    id: "weekly-stroke-rotation",
    kind: "weekly",
    title: "Rotazione Avanzata",
    description: "Usa stili differenti in settimana",
    baseTarget: 2,
    metric: "strokeVariety",
    xpReward: 180,
  },
  social: {
    id: "weekly-community-spark",
    kind: "weekly",
    title: "Scintilla Community",
    description: "Esegui azioni social utili (post/commenti/reazioni)",
    baseTarget: 3,
    metric: "socialActions",
    xpReward: 140,
  },
  cadence: {
    id: "weekly-rhythm-lock",
    kind: "weekly",
    title: "Blocco Tecnico",
    description: "Completa sessioni con cadenza tecnica controllata",
    baseTarget: 2,
    metric: "cadenceControlSessions",
    xpReward: 160,
  },
  zone: {
    id: "weekly-zone-grid",
    kind: "weekly",
    title: "Griglia Zone",
    description: "Chiudi giornate con bilanciamento cardio completo",
    baseTarget: 2,
    metric: "zoneBalanceDays",
    xpReward: 150,
  },
  presence: {
    id: "weekly-presence-loop",
    kind: "weekly",
    title: "Loop di Presenza",
    description: "Mantieni continuità di sessioni nella settimana",
    baseTarget: 3,
    metric: "sessions",
    xpReward: 145,
  },
  club: {
    id: "weekly-club-commitment",
    kind: "weekly",
    title: "Commitment Club",
    description: "Conferma partecipazioni ad attività club",
    baseTarget: 1,
    metric: "eventRsvps",
    xpReward: 160,
  },
};

const BATTLE_PASS_REWARDS = [
  {
    level: 3,
    rewardCode: "S1-BDG-005",
    rewardName: "Badge: Finestra Cadenza",
    rewardType: "badge",
    rarity: "common" as const,
  },
  {
    level: 5,
    rewardCode: "S1-BDG-001",
    rewardName: "Badge: Frequenza Solida",
    rewardType: "badge",
    rarity: "common" as const,
  },
  {
    level: 8,
    rewardCode: "S1-BDG-006",
    rewardName: "Badge: Bilanciamento Zone",
    rewardType: "badge",
    rarity: "common" as const,
  },
  {
    level: 10,
    rewardCode: "S1-BDG-002",
    rewardName: "Badge: Equilibrio Dinamico",
    rewardType: "badge",
    rarity: "rare" as const,
  },
  {
    level: 14,
    rewardCode: "S1-BDG-007",
    rewardName: "Badge: Segnale al Team",
    rewardType: "badge",
    rarity: "rare" as const,
  },
  {
    level: 18,
    rewardCode: "S1-BDG-008",
    rewardName: "Badge: Rotazione Avanzata",
    rewardType: "badge",
    rarity: "rare" as const,
  },
  {
    level: 20,
    rewardCode: "S1-BDG-003",
    rewardName: "Badge: Voce della Crew",
    rewardType: "badge",
    rarity: "epic" as const,
  },
  {
    level: 24,
    rewardCode: "S1-BDG-009",
    rewardName: "Badge: Scintilla Community",
    rewardType: "badge",
    rarity: "epic" as const,
  },
  {
    level: 28,
    rewardCode: "S1-BDG-010",
    rewardName: "Badge: Commitment Club",
    rewardType: "badge",
    rarity: "epic" as const,
  },
  {
    level: 32,
    rewardCode: "S1-BDG-011",
    rewardName: "Badge: Pulse Keeper",
    rewardType: "badge",
    rarity: "epic" as const,
  },
  {
    level: 36,
    rewardCode: "S1-BDG-012",
    rewardName: "Badge: Rhythm Architect",
    rewardType: "badge",
    rarity: "legendary" as const,
  },
  {
    level: 40,
    rewardCode: "S1-BDG-004",
    rewardName: "Badge: Apex Stagionale",
    rewardType: "badge",
    rarity: "legendary" as const,
  },
];

const REWARD_CLAIM_BONUS_XP = {
  common: 50,
  rare: 110,
  epic: 200,
  legendary: 320,
} as const;

const SEASON_BADGE_ASSIGNMENTS = [
  {
    code: "S1-BDG-001",
    name: "Frequenza Solida",
    objective: "Completa 8 sessioni in finestra cadenza tecnica",
    metric: "cadenceControlSessions",
    target: 8,
    rarity: "common" as const,
  },
  {
    code: "S1-BDG-002",
    name: "Equilibrio Dinamico",
    objective: "Raggiungi 7 giornate con bilanciamento zone",
    metric: "zoneBalanceDays",
    target: 7,
    rarity: "rare" as const,
  },
  {
    code: "S1-BDG-003",
    name: "Voce della Crew",
    objective: "Raggiungi 20 azioni social nella season",
    metric: "socialActions",
    target: 20,
    rarity: "epic" as const,
  },
  {
    code: "S1-BDG-004",
    name: "Apex Stagionale",
    objective: "Completa il battle pass livello 40",
    metric: "seasonLevel",
    target: 40,
    rarity: "legendary" as const,
  },
  {
    code: "S1-BDG-005",
    name: "Finestra Cadenza",
    objective: "Completa 4 sessioni con cadenza tecnica controllata",
    metric: "cadenceControlSessions",
    target: 4,
    rarity: "common" as const,
  },
  {
    code: "S1-BDG-006",
    name: "Bilanciamento Zone",
    objective: "Raggiungi 3 giornate cardio bilanciate",
    metric: "zoneBalanceDays",
    target: 3,
    rarity: "common" as const,
  },
  {
    code: "S1-BDG-007",
    name: "Segnale al Team",
    objective: "Registra 8 azioni social utili in community",
    metric: "socialActions",
    target: 8,
    rarity: "rare" as const,
  },
  {
    code: "S1-BDG-008",
    name: "Rotazione Avanzata",
    objective: "Nuota almeno 3 stili differenti nella season",
    metric: "strokeVariety",
    target: 3,
    rarity: "rare" as const,
  },
  {
    code: "S1-BDG-009",
    name: "Scintilla Community",
    objective: "Raggiungi 30 azioni social nella season",
    metric: "socialActions",
    target: 30,
    rarity: "epic" as const,
  },
  {
    code: "S1-BDG-010",
    name: "Commitment Club",
    objective: "Conferma 2 partecipazioni a eventi club",
    metric: "eventRsvps",
    target: 2,
    rarity: "epic" as const,
  },
  {
    code: "S1-BDG-011",
    name: "Pulse Keeper",
    objective: "Completa 18 sessioni nella season",
    metric: "sessions",
    target: 18,
    rarity: "epic" as const,
  },
  {
    code: "S1-BDG-012",
    name: "Rhythm Architect",
    objective: "Completa 14 sessioni tecniche a cadenza controllata",
    metric: "cadenceControlSessions",
    target: 14,
    rarity: "legendary" as const,
  },
];

type MissionMetricSnapshot = {
  sessions: number;
  strokeVariety: number;
  socialActions: number;
  eventRsvps: number;
  cadenceControlSessions: number;
  zoneBalanceDays: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay(); // 0=Sun
  const diffFromMonday = (day + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - diffFromMonday);
  return dayStart;
}

function buildLevelThresholds(levelCap = LEVEL_CAP) {
  const thresholds: Array<{ level: number; xpRequired: number }> = [];
  let cumulative = 0;
  for (let level = 1; level <= levelCap; level += 1) {
    if (level === 1) {
      thresholds.push({ level, xpRequired: 0 });
      continue;
    }
    // Progressive curve: early levels are quick, endgame is steeper.
    const xpStep = Math.round(120 + (level - 2) * 28 + Math.pow(level - 2, 1.15) * 6);
    cumulative += xpStep;
    thresholds.push({ level, xpRequired: cumulative });
  }
  return thresholds;
}

function getSeasonWindow(now = new Date()) {
  const nowMs = now.getTime();
  const seasonDurationMs = SEASON_DURATION_DAYS * DAY_MS;
  const elapsedMs = Math.max(0, nowMs - SEASON_ANCHOR_UTC);
  const seasonIndex = Math.floor(elapsedMs / seasonDurationMs);
  const startMs = SEASON_ANCHOR_UTC + seasonIndex * seasonDurationMs;
  const endMs = startMs + seasonDurationMs - 1;
  const seasonNumber = seasonIndex + 1;
  return {
    id: `electric-ice-s${seasonNumber}`,
    name: `Electric Ice - Season ${seasonNumber}`,
    theme: "Electric Ice",
    startAt: new Date(startMs),
    endAt: new Date(endMs),
    seasonNumber,
    durationDays: SEASON_DURATION_DAYS,
  };
}

function resolveLevelFromXp(totalSeasonXp: number, thresholds: Array<{ level: number; xpRequired: number }>) {
  let currentLevel = 1;
  for (const threshold of thresholds) {
    if (totalSeasonXp >= threshold.xpRequired) {
      currentLevel = threshold.level;
    } else {
      break;
    }
  }

  const currentLevelThreshold = thresholds.find((entry) => entry.level === currentLevel) ?? thresholds[0];
  const nextLevelThreshold = thresholds.find((entry) => entry.level === currentLevel + 1) ?? null;
  const prevXp = currentLevelThreshold?.xpRequired ?? 0;
  const nextXp = nextLevelThreshold?.xpRequired ?? prevXp;
  const span = Math.max(1, nextXp - prevXp);
  const localProgress = nextLevelThreshold ? clamp(((totalSeasonXp - prevXp) / span) * 100, 0, 100) : 100;
  const totalProgress = clamp((currentLevel / LEVEL_CAP) * 100, 0, 100);

  return {
    currentLevel,
    nextLevel: nextLevelThreshold?.level ?? null,
    levelProgressPercent: Math.round(localProgress),
    totalProgressPercent: Math.round(totalProgress),
    currentLevelXpFloor: prevXp,
    nextLevelXpRequired: nextLevelThreshold?.xpRequired ?? null,
    xpToNextLevel: nextLevelThreshold ? Math.max(0, nextLevelThreshold.xpRequired - totalSeasonXp) : 0,
  };
}

function mapMissionProgress(template: MissionTemplate, snapshot: MissionMetricSnapshot) {
  const current = Number(snapshot[template.metric] ?? 0);
  const progress = clamp((current / template.target) * 100, 0, 100);
  return {
    id: template.id,
    kind: template.kind,
    title: template.title,
    description: template.description,
    metric: template.metric,
    current,
    target: template.target,
    progress: Math.round(progress),
    completed: current >= template.target,
    xpReward: template.xpReward,
  };
}

function withTarget(blueprint: MissionBlueprint, target: number): MissionTemplate {
  return {
    ...blueprint,
    target: Math.max(1, Math.round(target)),
  };
}

function buildAdaptiveMissionPlan(args: {
  recentSnapshot: MissionMetricSnapshot;
  hasActiveClubMembership: boolean;
}) {
  const { recentSnapshot, hasActiveClubMembership } = args;
  const recentSessions = Math.max(1, recentSnapshot.sessions);
  const cadenceRate = recentSnapshot.cadenceControlSessions / recentSessions;
  const zoneRate = recentSnapshot.zoneBalanceDays / recentSessions;
  const socialPerWeek = recentSnapshot.socialActions / 4;
  const clubSignal = recentSnapshot.eventRsvps;

  const daily: MissionTemplate[] = [
    withTarget(DAILY_MISSION_POOL.active, 1),
  ];
  daily.push(
    cadenceRate <= zoneRate
      ? withTarget(DAILY_MISSION_POOL.cadence, 1)
      : withTarget(DAILY_MISSION_POOL.zone, 1),
  );
  daily.push(withTarget(DAILY_MISSION_POOL.community, 1));

  const weeklyStrokeTarget = recentSnapshot.strokeVariety >= 3 ? 3 : 2;
  const weeklySocialTarget = clamp(Math.round(socialPerWeek + 1), 2, 4);
  const weeklyCadenceTarget = clamp(Math.round(recentSnapshot.cadenceControlSessions / 4 + 1), 1, 3);
  const weeklyZoneTarget = clamp(Math.round(recentSnapshot.zoneBalanceDays / 4 + 1), 1, 3);
  const weeklyPresenceTarget = clamp(Math.round(recentSnapshot.sessions / 4 + 1), 2, 4);

  const weeklyBase: MissionTemplate[] = [
    withTarget(WEEKLY_MISSION_POOL.stroke, weeklyStrokeTarget),
  ];

  const weightedCandidates: Array<{ mission: MissionTemplate; weight: number }> = [
    {
      mission: withTarget(WEEKLY_MISSION_POOL.cadence, weeklyCadenceTarget),
      weight: 1 - clamp(cadenceRate, 0, 1),
    },
    {
      mission: withTarget(WEEKLY_MISSION_POOL.zone, weeklyZoneTarget),
      weight: 1 - clamp(zoneRate, 0, 1),
    },
    {
      mission: withTarget(WEEKLY_MISSION_POOL.social, weeklySocialTarget),
      weight: socialPerWeek < 2 ? 0.9 : socialPerWeek < 4 ? 0.6 : 0.35,
    },
    {
      mission: withTarget(WEEKLY_MISSION_POOL.presence, weeklyPresenceTarget),
      weight: recentSnapshot.sessions < 8 ? 0.8 : 0.45,
    },
  ];

  if (hasActiveClubMembership && clubSignal > 0) {
    weightedCandidates.push({
      mission: withTarget(WEEKLY_MISSION_POOL.club, 1),
      weight: 0.58,
    });
  }

  const selected = weightedCandidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)
    .map((entry) => entry.mission);

  const weekly = [...weeklyBase, ...selected];

  return {
    daily,
    weekly,
    profile: {
      cadenceRate: Math.round(cadenceRate * 100),
      zoneRate: Math.round(zoneRate * 100),
      socialPerWeek: Number(socialPerWeek.toFixed(1)),
      baselineSessionsMonthly: recentSnapshot.sessions,
    },
  };
}

async function getMissionSnapshotForRange(userId: number, startDate: Date, endDate: Date): Promise<MissionMetricSnapshot> {
  const database = await getDb();
  if (!database) {
    return {
      sessions: 0,
      strokeVariety: 0,
      socialActions: 0,
      eventRsvps: 0,
      cadenceControlSessions: 0,
      zoneBalanceDays: 0,
    };
  }

  const [activityRows, zoneRows, postsRows, commentsRows, reactionsRows, rsvpRows] = await Promise.all([
    database
      .select({
        sessions: sql<number>`count(*)`,
        strokeVariety: sql<number>`coalesce(count(distinct ${swimmingActivities.strokeType}), 0)`,
        cadenceControlSessions: sql<number>`coalesce(sum(case when (
            (${swimmingActivities.avgStrokeCadence} is not null and ${swimmingActivities.avgStrokeCadence} between 22 and 44)
            or (${swimmingActivities.avgPacePer100m} is not null and ${swimmingActivities.avgPacePer100m} between 100 and 155 and ${swimmingActivities.durationSeconds} >= 1200)
          ) then 1 else 0 end), 0)`,
      })
      .from(swimmingActivities)
      .where(
        and(
          eq(swimmingActivities.userId, userId),
          gte(swimmingActivities.activityDate, startDate),
          lte(swimmingActivities.activityDate, endDate),
        ),
      ),
    database.execute(sql`
      select coalesce(count(*), 0) as zone_balance_days
      from (
        select date(activity_date) as d
        from swimming_activities
        where user_id = ${userId}
          and activity_date >= ${startDate}
          and activity_date <= ${endDate}
        group by date(activity_date)
        having (
          coalesce(sum(coalesce(hr_zone_2_seconds, 0)), 0) >= 300
          and coalesce(sum(coalesce(hr_zone_4_seconds, 0) + coalesce(hr_zone_5_seconds, 0)), 0) >= 60
        )
        or (
          coalesce(max(avg_heart_rate), 0) >= 120
          and coalesce(max(avg_heart_rate), 0) <= 165
          and coalesce(max(duration_seconds), 0) >= 1200
        )
      ) daily
    `),
    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.userId, userId),
          gte(socialPosts.createdAt, startDate),
          lte(socialPosts.createdAt, endDate),
        ),
      ),
    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(socialComments)
      .where(
        and(
          eq(socialComments.userId, userId),
          gte(socialComments.createdAt, startDate),
          lte(socialComments.createdAt, endDate),
        ),
      ),
    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(postReactions)
      .where(
        and(
          eq(postReactions.userId, userId),
          gte(postReactions.createdAt, startDate),
          lte(postReactions.createdAt, endDate),
        ),
      ),
    database
      .select({
        count: sql<number>`count(*)`,
      })
      .from(eventAttendees)
      .where(
        and(
          eq(eventAttendees.userId, userId),
          gte(eventAttendees.rsvpAt, startDate),
          lte(eventAttendees.rsvpAt, endDate),
        ),
      ),
  ]);

  const row = activityRows[0];
  const postsCount = Number(postsRows[0]?.count ?? 0);
  const commentsCount = Number(commentsRows[0]?.count ?? 0);
  const reactionsCount = Number(reactionsRows[0]?.count ?? 0);
  const rsvpCount = Number(rsvpRows[0]?.count ?? 0);
  const zoneBalanceDays =
    Number((zoneRows.rows?.[0] as { zone_balance_days?: number } | undefined)?.zone_balance_days ?? 0);

  return {
    sessions: Number(row?.sessions ?? 0),
    strokeVariety: Number(row?.strokeVariety ?? 0),
    socialActions: postsCount + commentsCount + reactionsCount,
    eventRsvps: rsvpCount,
    cadenceControlSessions: Number(row?.cadenceControlSessions ?? 0),
    zoneBalanceDays: zoneBalanceDays,
  };
}

async function getSeasonXpForUser(userId: number, startDate: Date, endDate: Date): Promise<number> {
  const database = await getDb();
  if (!database) return 0;

  const xpRows = await database
    .select({
      xp: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)`,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, userId),
        gte(xpTransactions.createdAt, startDate),
        lte(xpTransactions.createdAt, endDate),
      ),
    );

  const txXp = Number(xpRows[0]?.xp ?? 0);
  if (txXp > 0) return txXp;

  // Fallback for legacy users without full xp_transactions history.
  const activityRows = await database
    .select({
      xp: sql<number>`coalesce(sum(${swimmingActivities.xpEarned}), 0)`,
    })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, startDate),
        lte(swimmingActivities.activityDate, endDate),
      ),
    );
  return Number(activityRows[0]?.xp ?? 0);
}

async function getClaimedRewardCodesForSeason(userId: number, seasonId: string): Promise<Set<string>> {
  const database = await getDb();
  if (!database) return new Set<string>();
  const prefix = `season_reward:${seasonId}:`;

  const rows = await database
    .select({
      description: xpTransactions.description,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, userId),
        sql`${xpTransactions.description} like ${`${prefix}%`}`,
      ),
    );

  const claimedCodes = new Set<string>();
  for (const row of rows) {
    const description = String(row.description ?? "");
    if (!description.startsWith(prefix)) continue;
    const rewardCode = description.slice(prefix.length).trim();
    if (rewardCode) claimedCodes.add(rewardCode);
  }
  return claimedCodes;
}

export async function getCurrentSeasonState(userId: number) {
  const season = getSeasonWindow();
  const thresholds = buildLevelThresholds();

  const todayStart = startOfUtcDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const weekStart = startOfUtcWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);
  const recentStart = new Date(Date.now() - 28 * DAY_MS);

  const database = await getDb();
  const clubMembershipCount = database
    ? Number(
        (
          await database
            .select({ count: sql<number>`count(*)` })
            .from(communityClubMembers)
            .where(and(eq(communityClubMembers.userId, userId), eq(communityClubMembers.status, "active")))
        )[0]?.count ?? 0,
      )
    : 0;
  const hasActiveClubMembership = clubMembershipCount > 0;

  const [seasonStats, dailySnapshot, weeklySnapshot, recentSnapshot, seasonXp, claimedRewardCodes] = await Promise.all([
    getMissionSnapshotForRange(userId, season.startAt, season.endAt),
    getMissionSnapshotForRange(userId, todayStart, new Date(tomorrowStart.getTime() - 1)),
    getMissionSnapshotForRange(userId, weekStart, weekEnd),
    getMissionSnapshotForRange(userId, recentStart, new Date()),
    getSeasonXpForUser(userId, season.startAt, season.endAt),
    getClaimedRewardCodesForSeason(userId, season.id),
  ]);

  const level = resolveLevelFromXp(seasonXp, thresholds);
  const adaptiveMissionPlan = buildAdaptiveMissionPlan({
    recentSnapshot,
    hasActiveClubMembership,
  });
  const dailyMissions = adaptiveMissionPlan.daily.map((mission) => mapMissionProgress(mission, dailySnapshot));
  const weeklyMissions = adaptiveMissionPlan.weekly.map((mission) =>
    mapMissionProgress(mission, weeklySnapshot),
  );

  const completedMissions = [...dailyMissions, ...weeklyMissions].filter((mission) => mission.completed).length;
  const totalMissions = dailyMissions.length + weeklyMissions.length;
  const completionRate = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0;

  const remainingMs = Math.max(0, season.endAt.getTime() - Date.now());

  const badgeAssignments = SEASON_BADGE_ASSIGNMENTS.map((assignment) => {
    const current = assignment.metric === "seasonLevel"
      ? level.currentLevel
      : Number((seasonStats as Record<string, unknown>)[assignment.metric] ?? 0);
    const target = Math.max(1, Number(assignment.target ?? 1));
    const progress = Math.min(100, Math.round((current / target) * 100));
    return {
      ...assignment,
      current,
      target,
      progress,
      earned: current >= target,
    };
  });

  return {
    season: {
      id: season.id,
      name: season.name,
      theme: season.theme,
      seasonNumber: season.seasonNumber,
      startAt: season.startAt,
      endAt: season.endAt,
      durationDays: season.durationDays,
      remainingMs,
      remainingDays: Math.ceil(remainingMs / DAY_MS),
      levelCap: LEVEL_CAP,
    },
    progress: {
      seasonXp,
      ...level,
    },
    missions: {
      daily: dailyMissions,
      weekly: weeklyMissions,
      completedMissions,
      totalMissions,
      completionRate,
    },
    seasonStats,
    missionProfile: adaptiveMissionPlan.profile,
    missionMode: hasActiveClubMembership ? "club-enabled" : "solo-fallback",
    rewards: BATTLE_PASS_REWARDS.map((reward) => ({
      ...reward,
      unlocked: level.currentLevel >= reward.level,
      claimed: claimedRewardCodes.has(reward.rewardCode),
      claimXpBonus: REWARD_CLAIM_BONUS_XP[reward.rarity] ?? 0,
    })),
    badgeAssignments,
  };
}

export async function getSeasonLeaderboard(limit = 20) {
  const safeLimit = clamp(Math.floor(limit || 20), 1, 100);
  const season = getSeasonWindow();
  const database = await getDb();
  if (!database) return [];

  const seasonTxXpExpr = sql<number>`
    coalesce(
      (
        select sum(${xpTransactions.amount})
        from ${xpTransactions}
        where ${xpTransactions.userId} = ${swimmerProfiles.userId}
          and ${xpTransactions.createdAt} >= ${season.startAt}
          and ${xpTransactions.createdAt} <= ${season.endAt}
      ),
      0
    )
  `;

  const seasonActivityXpExpr = sql<number>`
    coalesce(
      (
        select sum(${swimmingActivities.xpEarned})
        from ${swimmingActivities}
        where ${swimmingActivities.userId} = ${swimmerProfiles.userId}
          and ${swimmingActivities.activityDate} >= ${season.startAt}
          and ${swimmingActivities.activityDate} <= ${season.endAt}
      ),
      0
    )
  `;

  const seasonXpExpr = sql<number>`
    case
      when ${seasonTxXpExpr} > 0 then ${seasonTxXpExpr}
      else ${seasonActivityXpExpr}
    end
  `;

  const rows = await database
    .select({
      userId: swimmerProfiles.userId,
      name: users.name,
      username: swimmerProfiles.username,
      avatarUrl: swimmerProfiles.avatarUrl,
      totalXp: swimmerProfiles.totalXp,
      seasonXp: seasonXpExpr,
    })
    .from(swimmerProfiles)
    .innerJoin(users, eq(users.id, swimmerProfiles.userId))
    .orderBy(desc(seasonXpExpr), desc(swimmerProfiles.totalXp))
    .limit(safeLimit);

  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    name: row.username || row.name || `Utente ${row.userId}`,
    avatarUrl: row.avatarUrl,
    seasonXp: Number(row.seasonXp ?? 0),
    totalXp: Number(row.totalXp ?? 0),
  }));
}

export async function getMySeasonRank(userId: number) {
  const season = getSeasonWindow();
  const database = await getDb();
  if (!database) return null;

  const seasonTxXpExpr = sql<number>`
    coalesce(
      (
        select sum(${xpTransactions.amount})
        from ${xpTransactions}
        where ${xpTransactions.userId} = ${swimmerProfiles.userId}
          and ${xpTransactions.createdAt} >= ${season.startAt}
          and ${xpTransactions.createdAt} <= ${season.endAt}
      ),
      0
    )
  `;

  const seasonActivityXpExpr = sql<number>`
    coalesce(
      (
        select sum(${swimmingActivities.xpEarned})
        from ${swimmingActivities}
        where ${swimmingActivities.userId} = ${swimmerProfiles.userId}
          and ${swimmingActivities.activityDate} >= ${season.startAt}
          and ${swimmingActivities.activityDate} <= ${season.endAt}
      ),
      0
    )
  `;

  const seasonXpExpr = sql<number>`
    case
      when ${seasonTxXpExpr} > 0 then ${seasonTxXpExpr}
      else ${seasonActivityXpExpr}
    end
  `;

  const rankedRows = await database
    .select({
      userId: swimmerProfiles.userId,
      name: users.name,
      username: swimmerProfiles.username,
      avatarUrl: swimmerProfiles.avatarUrl,
      totalXp: swimmerProfiles.totalXp,
      seasonXp: seasonXpExpr,
      rank: sql<number>`row_number() over (order by ${seasonXpExpr} desc, ${swimmerProfiles.totalXp} desc, ${swimmerProfiles.userId} asc)`,
    })
    .from(swimmerProfiles)
    .innerJoin(users, eq(users.id, swimmerProfiles.userId))
    .orderBy(desc(seasonXpExpr), desc(swimmerProfiles.totalXp), asc(swimmerProfiles.userId));

  const me = rankedRows.find((row) => Number(row.userId) === Number(userId));
  if (!me) return null;

  const around = rankedRows
    .filter((row) => Math.abs(Number(row.rank) - Number(me.rank)) <= 1)
    .map((row) => ({
      rank: Number(row.rank),
      userId: row.userId,
      name: row.username || row.name || `Utente ${row.userId}`,
      avatarUrl: row.avatarUrl,
      seasonXp: Number(row.seasonXp ?? 0),
      totalXp: Number(row.totalXp ?? 0),
      isMe: Number(row.userId) === Number(userId),
    }));

  return {
    me: {
      rank: Number(me.rank),
      userId: me.userId,
      name: me.username || me.name || `Utente ${me.userId}`,
      avatarUrl: me.avatarUrl,
      seasonXp: Number(me.seasonXp ?? 0),
      totalXp: Number(me.totalXp ?? 0),
    },
    around,
  };
}

export async function claimSeasonReward(userId: number, rewardCode: string) {
  const season = getSeasonWindow();
  const reward = BATTLE_PASS_REWARDS.find((entry) => entry.rewardCode === rewardCode);
  if (!reward) {
    return { success: false as const, reason: "not_found" as const };
  }

  const state = await getCurrentSeasonState(userId);
  const rewardState = state.rewards.find((entry) => entry.rewardCode === rewardCode);
  if (!rewardState) {
    return { success: false as const, reason: "not_found" as const };
  }
  if (!rewardState.unlocked) {
    return { success: false as const, reason: "locked" as const };
  }
  if (rewardState.claimed) {
    return { success: true as const, alreadyClaimed: true as const, xpAwarded: 0 };
  }

  const database = await getDb();
  if (!database) {
    return { success: false as const, reason: "db_unavailable" as const };
  }

  const xpBonus = REWARD_CLAIM_BONUS_XP[reward.rarity] ?? 0;
  const description = `season_reward:${season.id}:${reward.rewardCode}`;
  const claimResult = await database.transaction(async (tx) => {
    // Serialize claims for the same season reward key (prevents double-claim race conditions).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${description}))`);

    const existingClaim = await tx
      .select({
        count: sql<number>`count(*)`,
      })
      .from(xpTransactions)
      .where(
        and(
          eq(xpTransactions.userId, userId),
          eq(xpTransactions.description, description),
        ),
      );

    if (Number(existingClaim[0]?.count ?? 0) > 0) {
      return { alreadyClaimed: true as const };
    }

    await tx.insert(xpTransactions).values({
      userId,
      amount: xpBonus,
      reason: "bonus" as (typeof xpReasonEnum.enumValues)[number],
      referenceId: reward.level,
      description,
    });

    await tx
      .update(swimmerProfiles)
      .set({
        totalXp: sql`${swimmerProfiles.totalXp} + ${xpBonus}`,
        updatedAt: new Date(),
      })
      .where(eq(swimmerProfiles.userId, userId));

    return { alreadyClaimed: false as const };
  });

  if (claimResult.alreadyClaimed) {
    return { success: true as const, alreadyClaimed: true as const, xpAwarded: 0 };
  }

  return {
    success: true as const,
    alreadyClaimed: false as const,
    xpAwarded: xpBonus,
    rewardCode: reward.rewardCode,
    rewardName: reward.rewardName,
  };
}
