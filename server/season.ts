import { and, eq, gte, lte, sql, desc } from "drizzle-orm";
import { getDb } from "./db";
import {
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

const DAILY_MISSIONS = [
  {
    id: "daily-cadence-window",
    kind: "daily" as const,
    title: "Finestra Cadenza",
    description: "Completa una sessione con cadenza tecnica controllata",
    target: 1,
    metric: "cadenceControlSessions" as const,
    xpReward: 60,
  },
  {
    id: "daily-zone-balance",
    kind: "daily" as const,
    title: "Bilanciamento Zone",
    description: "Chiudi una sessione con equilibrio aerobico + picco intenso",
    target: 1,
    metric: "zoneBalanceDays" as const,
    xpReward: 55,
  },
  {
    id: "daily-community-touch",
    kind: "daily" as const,
    title: "Segnale al Team",
    description: "Fai almeno 1 azione social nel feed",
    target: 1,
    metric: "socialActions" as const,
    xpReward: 50,
  },
];

const WEEKLY_MISSIONS = [
  {
    id: "weekly-stroke-rotation",
    kind: "weekly" as const,
    title: "Rotazione Avanzata",
    description: "Usa almeno 2 stili diversi nella settimana",
    target: 2,
    metric: "strokeVariety" as const,
    xpReward: 180,
  },
  {
    id: "weekly-community-spark",
    kind: "weekly" as const,
    title: "Scintilla Community",
    description: "Esegui 3 azioni social (post/commenti/reazioni)",
    target: 3,
    metric: "socialActions" as const,
    xpReward: 140,
  },
  {
    id: "weekly-club-commitment",
    kind: "weekly" as const,
    title: "Commitment Club",
    description: "Conferma la partecipazione a 1 evento club",
    target: 1,
    metric: "eventRsvps" as const,
    xpReward: 160,
  },
];

const WEEKLY_MISSIONS_NO_CLUB = [
  {
    id: "weekly-stroke-rotation",
    kind: "weekly" as const,
    title: "Rotazione Avanzata",
    description: "Usa almeno 2 stili diversi nella settimana",
    target: 2,
    metric: "strokeVariety" as const,
    xpReward: 180,
  },
  {
    id: "weekly-community-spark",
    kind: "weekly" as const,
    title: "Scintilla Community",
    description: "Esegui 3 azioni social (post/commenti/reazioni)",
    target: 3,
    metric: "socialActions" as const,
    xpReward: 140,
  },
  {
    id: "weekly-rhythm-lock",
    kind: "weekly" as const,
    title: "Blocco Tecnico",
    description: "Completa 2 sessioni con cadenza tecnica controllata",
    target: 2,
    metric: "cadenceControlSessions" as const,
    xpReward: 160,
  },
];

const BATTLE_PASS_REWARDS = [
  { level: 5, rewardCode: "S1-BDG-001", rewardName: "Badge: Frammento Neon I", rewardType: "badge", rarity: "common" as const },
  { level: 10, rewardCode: "S1-BDG-002", rewardName: "Badge: Frammento Neon II", rewardType: "badge", rarity: "rare" as const },
  { level: 15, rewardCode: "S1-TITLE-PULSE-KEEPER", rewardName: "Titolo: Pulse Keeper", rewardType: "title", rarity: "rare" as const },
  { level: 20, rewardCode: "S1-BDG-003", rewardName: "Badge: Vector Core", rewardType: "badge", rarity: "epic" as const },
  { level: 25, rewardCode: "S1-FRAME-GLACIER-RING", rewardName: "Frame: Glacier Ring", rewardType: "frame", rarity: "epic" as const },
  { level: 30, rewardCode: "S1-TITLE-RHYTHM-ARCHITECT", rewardName: "Titolo: Rhythm Architect", rewardType: "title", rarity: "epic" as const },
  { level: 35, rewardCode: "S1-EFFECT-AQUA-FLUX", rewardName: "Effetto: Aqua Flux Trail", rewardType: "effect", rarity: "legendary" as const },
  { level: 40, rewardCode: "S1-BDG-004", rewardName: "Badge: Electric Ice Apex", rewardType: "badge", rarity: "legendary" as const },
];

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

export async function getCurrentSeasonState(userId: number) {
  const season = getSeasonWindow();
  const thresholds = buildLevelThresholds();

  const todayStart = startOfUtcDay(new Date());
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const weekStart = startOfUtcWeek(new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS - 1);

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

  const [seasonStats, dailySnapshot, weeklySnapshot, seasonXp] = await Promise.all([
    getMissionSnapshotForRange(userId, season.startAt, season.endAt),
    getMissionSnapshotForRange(userId, todayStart, new Date(tomorrowStart.getTime() - 1)),
    getMissionSnapshotForRange(userId, weekStart, weekEnd),
    getSeasonXpForUser(userId, season.startAt, season.endAt),
  ]);

  const level = resolveLevelFromXp(seasonXp, thresholds);
  const weeklyMissionTemplates = hasActiveClubMembership ? WEEKLY_MISSIONS : WEEKLY_MISSIONS_NO_CLUB;
  const dailyMissions = DAILY_MISSIONS.map((mission) => mapMissionProgress(mission, dailySnapshot));
  const weeklyMissions = weeklyMissionTemplates.map((mission) =>
    mapMissionProgress(mission, weeklySnapshot),
  );

  const completedMissions = [...dailyMissions, ...weeklyMissions].filter((mission) => mission.completed).length;
  const totalMissions = dailyMissions.length + weeklyMissions.length;
  const completionRate = totalMissions > 0 ? Math.round((completedMissions / totalMissions) * 100) : 0;

  const remainingMs = Math.max(0, season.endAt.getTime() - Date.now());

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
    missionMode: hasActiveClubMembership ? "club-enabled" : "solo-fallback",
    rewards: BATTLE_PASS_REWARDS.map((reward) => ({
      ...reward,
      unlocked: level.currentLevel >= reward.level,
      claimed: false,
    })),
    badgeAssignments: SEASON_BADGE_ASSIGNMENTS,
  };
}

export async function getSeasonLeaderboard(limit = 20) {
  const safeLimit = clamp(Math.floor(limit || 20), 1, 100);
  const season = getSeasonWindow();
  const database = await getDb();
  if (!database) return [];

  const seasonXpExpr = sql<number>`
    coalesce(
      sum(
        case
          when ${xpTransactions.createdAt} >= ${season.startAt}
           and ${xpTransactions.createdAt} <= ${season.endAt}
          then ${xpTransactions.amount}
          else 0
        end
      ),
      0
    )
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
    .leftJoin(xpTransactions, eq(xpTransactions.userId, swimmerProfiles.userId))
    .groupBy(swimmerProfiles.userId, users.id)
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
