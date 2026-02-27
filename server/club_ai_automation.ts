import type { ClubAiJobType, ClubAiRunStatus, ClubPoolWorkoutDirective } from "@shared/types";
import { ENV } from "./_core/env";
import { generateText } from "./_core/text_llm";
import { generateClubAiImageViaGemini } from "./club_ai_image";
import { generateClubPoolWorkoutPlan } from "./club_workouts_ai";
import { fetchNuotoSardegnaFutureMeetCandidates } from "./club_meets_nuotosardegna";
import {
  createAutomationRun,
  ensureClubAiBotUser,
  ensureClubAiConfig,
  getClubAiConfigByClubId,
  hasExternalMeetSourceHash,
  listEnabledClubAiConfigs,
  updateAutomationRun,
  upsertExternalMeetSource,
} from "./db_club_ai_automation";
import {
  createClubWorkoutDraftFromGeneration,
  getClubWorkoutBySessionDate,
  listClubWorkoutRecipients,
  publishClubWorkout,
} from "./db_club_workouts";
import {
  createClubMeet,
  listMeetMemberRecipients,
  transitionClubMeetStatus,
  upsertClubMeetEvents,
} from "./db_club_meets";
import { createClubPost } from "./db_clubs";
import { createNotification } from "./db_social_enhanced";
import { logger } from "./middleware/logger";

type ClubAiConfigRecord = {
  id: number;
  clubId: number;
  enabled: boolean;
  actorUserId: number;
  timezone: string;
  scanSourceUrl: string;
  imageModel: string | null;
  motivationPrompt: string | null;
};

type JobExecutionResult = {
  status: ClubAiRunStatus;
  resultJson: Record<string, unknown>;
  errorText?: string | null;
};

type ClubRunLog = {
  clubId: number;
  jobType: ClubAiJobType;
  status: ClubAiRunStatus;
  runId: number | null;
  scheduledKey: string;
  detail: Record<string, unknown>;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const MASTER_MEET_TEMPLATE: Array<{
  label: string;
  distanceMeters: number;
  stroke: string;
  gender: string | null;
}> = [
  { label: "50 SL", distanceMeters: 50, stroke: "SL", gender: null },
  { label: "100 SL", distanceMeters: 100, stroke: "SL", gender: null },
  { label: "200 SL", distanceMeters: 200, stroke: "SL", gender: null },
  { label: "400 SL", distanceMeters: 400, stroke: "SL", gender: null },
  { label: "800 SL", distanceMeters: 800, stroke: "SL", gender: null },
  { label: "1500 SL", distanceMeters: 1500, stroke: "SL", gender: null },
  { label: "50 DO", distanceMeters: 50, stroke: "DO", gender: null },
  { label: "100 DO", distanceMeters: 100, stroke: "DO", gender: null },
  { label: "200 DO", distanceMeters: 200, stroke: "DO", gender: null },
  { label: "50 RA", distanceMeters: 50, stroke: "RA", gender: null },
  { label: "100 RA", distanceMeters: 100, stroke: "RA", gender: null },
  { label: "200 RA", distanceMeters: 200, stroke: "RA", gender: null },
  { label: "50 DE", distanceMeters: 50, stroke: "DE", gender: null },
  { label: "100 DE", distanceMeters: 100, stroke: "DE", gender: null },
  { label: "200 DE", distanceMeters: 200, stroke: "DE", gender: null },
  { label: "100 MX", distanceMeters: 100, stroke: "MX", gender: null },
  { label: "200 MX", distanceMeters: 200, stroke: "MX", gender: null },
  { label: "400 MX", distanceMeters: 400, stroke: "MX", gender: null },
  { label: "4x50 SL F", distanceMeters: 200, stroke: "SL", gender: "F" },
  { label: "4x50 SL M", distanceMeters: 200, stroke: "SL", gender: "M" },
  { label: "4x50 MX F", distanceMeters: 200, stroke: "MX", gender: "F" },
  { label: "4x50 MX M", distanceMeters: 200, stroke: "MX", gender: "M" },
];

function getLocalClock(now: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const weekdayLabel = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekday = WEEKDAY_INDEX[weekdayLabel] ?? 1;
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, minute, weekday, dateKey, timezone };
}

function dateFromLocalParts(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isDueAtOrAfter(hour: number, minute: number, clock: ReturnType<typeof getLocalClock>) {
  return clock.hour > hour || (clock.hour === hour && clock.minute >= minute);
}

function shouldRunJob(jobType: ClubAiJobType, clock: ReturnType<typeof getLocalClock>) {
  switch (jobType) {
    case "scan_meets_weekly":
      return clock.weekday === 1 && isDueAtOrAfter(6, 15, clock);
    case "generate_workouts_weekly":
      return clock.weekday === 1 && isDueAtOrAfter(6, 30, clock);
    case "publish_workout_daily":
      return [1, 3, 5].includes(clock.weekday) && isDueAtOrAfter(6, 45, clock);
    case "post_motivation_mwf":
      return [1, 3, 5].includes(clock.weekday) && isDueAtOrAfter(7, 30, clock);
    default:
      return false;
  }
}

function getWeekSessionDateKeys(clock: ReturnType<typeof getLocalClock>) {
  const base = dateFromLocalParts(clock.year, clock.month, clock.day, 12, 0);
  const monday = addDays(base, -(clock.weekday - 1));
  const wednesday = addDays(monday, 2);
  const friday = addDays(monday, 4);

  return {
    monday: toDateKey(monday),
    wednesday: toDateKey(wednesday),
    friday: toDateKey(friday),
  };
}

function createWorkoutDirectives(day: "monday" | "wednesday" | "friday"): ClubPoolWorkoutDirective {
  if (day === "monday") {
    return {
      focus: ["tecnica", "aerobico"],
      volume: "medium",
      intensity: "mixed",
      strokeMix: ["sl", "do", "ra", "mx"],
      equipment: ["pull", "tavoletta", "snorkel"],
      sessionMinutes: 60,
      targetDistanceMeters: 2800,
      notes: "Lavoro tecnico e controllo del core su gruppo Master 35-60.",
    };
  }

  if (day === "wednesday") {
    return {
      focus: ["aerobico", "soglia"],
      volume: "high",
      intensity: "mixed",
      strokeMix: ["sl", "do", "mx"],
      equipment: ["pull"],
      sessionMinutes: 75,
      targetDistanceMeters: 3200,
      notes: "Set aerobico a ritmo con progressioni controllate.",
    };
  }

  return {
    focus: ["velocita", "recupero"],
    volume: "medium",
    intensity: "hard",
    strokeMix: ["sl", "do", "de", "mx"],
    equipment: ["pinne", "tavoletta"],
    sessionMinutes: 60,
    targetDistanceMeters: 2600,
    notes: "Velocità e gambe con pinne. Recupero tecnico tra serie.",
  };
}

async function notifyClubMembers(params: {
  clubId: number;
  actorUserId: number;
  type: string;
  title: string;
  message: string;
  link: string;
  referenceId?: number;
}) {
  const recipients = await listClubWorkoutRecipients({
    userId: params.actorUserId,
    clubId: params.clubId,
  });

  const targetRecipients = recipients.filter((recipient) => Number(recipient.userId) !== Number(params.actorUserId));
  const deliveries = await Promise.allSettled(
    targetRecipients.map((recipient) =>
      createNotification({
        userId: recipient.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link,
        referenceId: params.referenceId,
      }),
    ),
  );

  const failed = deliveries.filter((item) => item.status === "rejected").length;
  return {
    recipients: targetRecipients.length,
    delivered: targetRecipients.length - failed,
    failed,
  };
}

function createMeetTemplateEvents() {
  return MASTER_MEET_TEMPLATE.map((event, index) => ({
    label: event.label,
    programOrder: index + 1,
    distanceMeters: event.distanceMeters,
    stroke: event.stroke,
    gender: event.gender,
    masterCategory: "Master",
    notes: null,
  }));
}

async function sendMeetStatusNotifications(params: {
  meetId: number;
  clubId: number;
  meetName: string;
  status: "published" | "open";
}) {
  const recipients = await listMeetMemberRecipients({
    meetId: params.meetId,
    audience: "all",
  });

  const payload =
    params.status === "published"
      ? {
          type: "meet_published",
          title: "Nuova convocazione gara",
          message: `Il meeting \"${params.meetName}\" è stato pubblicato.`,
        }
      : {
          type: "meet_entries_open",
          title: "Iscrizioni aperte",
          message: `Le iscrizioni per \"${params.meetName}\" sono aperte.`,
        };

  await Promise.allSettled(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        link: `/community/club/${params.clubId}/meet/${params.meetId}`,
        referenceId: params.meetId,
      }),
    ),
  );

  return recipients.length;
}

async function runScanMeetsWeekly(config: ClubAiConfigRecord, now: Date): Promise<JobExecutionResult> {
  const candidates = await fetchNuotoSardegnaFutureMeetCandidates({
    categoryUrl: config.scanSourceUrl,
    now,
  });

  if (candidates.length === 0) {
    return {
      status: "skipped",
      resultJson: {
        scanned: 0,
        created: 0,
        skipped: 0,
        errors: 0,
        note: "Nessun comunicato con gare future trovato",
      },
    };
  }

  const summary = {
    scanned: candidates.length,
    created: 0,
    skipped: 0,
    errors: 0,
  };

  const errors: Array<{ sourceUrl: string; message: string }> = [];

  for (const candidate of candidates) {
    const alreadyImported = await hasExternalMeetSourceHash({
      clubId: config.clubId,
      sourceHash: candidate.sourceHash,
    });

    if (alreadyImported) {
      summary.skipped += 1;
      continue;
    }

    const eventDate = candidate.eventDate;
    const startDate = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate(), 9, 0, 0, 0));
    const endDate = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate(), 19, 0, 0, 0));
    const registrationDeadline = new Date(Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth(), eventDate.getUTCDate(), 23, 59, 0, 0));
    registrationDeadline.setUTCDate(registrationDeadline.getUTCDate() - 5);

    try {
      const meet = await createClubMeet({
        actorId: config.actorUserId,
        clubId: config.clubId,
        name: candidate.title,
        venue: "Da comunicato Nuoto Sardegna",
        startDate,
        endDate,
        registrationDeadline,
        notes: `Sorgente: ${candidate.sourceUrl}`,
        timezone: config.timezone,
      });

      await upsertClubMeetEvents({
        actorId: config.actorUserId,
        meetId: meet.id,
        replaceAll: true,
        events: createMeetTemplateEvents(),
      });

      const publishTransition = await transitionClubMeetStatus({
        actorId: config.actorUserId,
        meetId: meet.id,
        status: "published",
      });
      if (publishTransition.changed) {
        await sendMeetStatusNotifications({
          meetId: meet.id,
          clubId: config.clubId,
          meetName: meet.name,
          status: "published",
        });
      }

      const openTransition = await transitionClubMeetStatus({
        actorId: config.actorUserId,
        meetId: meet.id,
        status: "open",
      });
      if (openTransition.changed) {
        await sendMeetStatusNotifications({
          meetId: meet.id,
          clubId: config.clubId,
          meetName: meet.name,
          status: "open",
        });
      }

      await upsertExternalMeetSource({
        clubId: config.clubId,
        sourceUrl: candidate.sourceUrl,
        sourceHash: candidate.sourceHash,
        sourceDate: candidate.eventDate,
        meetId: meet.id,
        status: "imported",
      });

      summary.created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Duplicate meet") {
        await upsertExternalMeetSource({
          clubId: config.clubId,
          sourceUrl: candidate.sourceUrl,
          sourceHash: candidate.sourceHash,
          sourceDate: candidate.eventDate,
          meetId: null,
          status: "duplicate",
        });
        summary.skipped += 1;
        continue;
      }

      summary.errors += 1;
      errors.push({ sourceUrl: candidate.sourceUrl, message });
      logger.warn("[club_ai] scan_meets_weekly candidate failed", {
        event: "club_ai:scan_meets_weekly_candidate_failed",
        clubId: config.clubId,
        sourceUrl: candidate.sourceUrl,
        message,
      });
    }
  }

  return {
    status: summary.errors > 0 ? (summary.created > 0 ? "partial" : "failed") : summary.created > 0 ? "success" : "skipped",
    resultJson: {
      ...summary,
      errors,
    },
    errorText: summary.errors > 0 && summary.created === 0 ? errors[0]?.message ?? "Meet import failed" : null,
  };
}

async function runGenerateWorkoutsWeekly(config: ClubAiConfigRecord, now: Date): Promise<JobExecutionResult> {
  const clock = getLocalClock(now, config.timezone);
  const dates = getWeekSessionDateKeys(clock);
  const dailyPlan: Array<{ date: string; day: "monday" | "wednesday" | "friday" }> = [
    { date: dates.monday, day: "monday" },
    { date: dates.wednesday, day: "wednesday" },
    { date: dates.friday, day: "friday" },
  ];

  const summary = {
    created: 0,
    skipped: 0,
    partial: 0,
    errors: 0,
    workouts: [] as Array<{ date: string; status: string; workoutId?: number }>,
  };

  for (const entry of dailyPlan) {
    try {
      const existing = await getClubWorkoutBySessionDate({
        userId: config.actorUserId,
        clubId: config.clubId,
        sessionDate: entry.date,
      });

      if (existing.workout) {
        summary.skipped += 1;
        summary.workouts.push({ date: entry.date, status: "already_exists", workoutId: Number(existing.workout.id) });
        continue;
      }

      const directives = createWorkoutDirectives(entry.day);
      const generation = await generateClubPoolWorkoutPlan({
        sessionDate: entry.date,
        directives,
      });

      const saved = await createClubWorkoutDraftFromGeneration({
        userId: config.actorUserId,
        clubId: config.clubId,
        sessionDate: entry.date,
        directives,
        workout: generation.plan,
        runStatus: generation.status,
        provider: generation.provider,
        model: generation.model,
        promptVersion: generation.promptVersion,
        rawResponse: generation.rawResponse,
        error: generation.error,
      });

      summary.created += 1;
      if (generation.status === "partial") {
        summary.partial += 1;
      }

      summary.workouts.push({
        date: entry.date,
        status: generation.status,
        workoutId: Number(saved.workout.id),
      });
    } catch (error) {
      summary.errors += 1;
      summary.workouts.push({ date: entry.date, status: "failed" });
      logger.warn("[club_ai] weekly workout generation failed", {
        event: "club_ai:generate_workouts_weekly_failed",
        clubId: config.clubId,
        sessionDate: entry.date,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let notificationSummary: { recipients: number; delivered: number; failed: number } | null = null;
  if (summary.created > 0) {
    notificationSummary = await notifyClubMembers({
      clubId: config.clubId,
      actorUserId: config.actorUserId,
      type: "club_workout_generated_weekly",
      title: "Workout settimanali pronti",
      message: "Il coach AI ha preparato i workout di LUN/MER/VEN. Verranno pubblicati giorno per giorno.",
      link: `/community/club/${config.clubId}/workouts`,
    });
  }

  return {
    status:
      summary.errors > 0
        ? summary.created > 0
          ? "partial"
          : "failed"
        : summary.created > 0
          ? summary.partial > 0
            ? "partial"
            : "success"
          : "skipped",
    resultJson: {
      ...summary,
      notification: notificationSummary,
    },
    errorText: summary.errors > 0 && summary.created === 0 ? "Weekly workout generation failed" : null,
  };
}

async function runPublishWorkoutDaily(config: ClubAiConfigRecord, now: Date): Promise<JobExecutionResult> {
  const clock = getLocalClock(now, config.timezone);
  const sessionDate = clock.dateKey;

  const existing = await getClubWorkoutBySessionDate({
    userId: config.actorUserId,
    clubId: config.clubId,
    sessionDate,
  });

  if (!existing.workout) {
    return {
      status: "skipped",
      resultJson: {
        sessionDate,
        published: false,
        reason: "No draft found for today",
      },
    };
  }

  const publishResult = await publishClubWorkout({
    userId: config.actorUserId,
    workoutId: existing.workout.id,
  });

  if (!publishResult.changed) {
    return {
      status: "skipped",
      resultJson: {
        sessionDate,
        published: false,
        workoutId: publishResult.workout.id,
        reason: "Already published",
      },
    };
  }

  const notification = await notifyClubMembers({
    clubId: config.clubId,
    actorUserId: config.actorUserId,
    type: "club_workout_published",
    title: "Workout del giorno pubblicato",
    message: `Nuovo workout disponibile: ${publishResult.workout.title}`,
    link: `/community/club/${config.clubId}/workouts/${publishResult.workout.id}`,
    referenceId: publishResult.workout.id,
  });

  return {
    status: "success",
    resultJson: {
      sessionDate,
      published: true,
      workoutId: publishResult.workout.id,
      notification,
    },
  };
}

async function generateMotivationalText(config: ClubAiConfigRecord): Promise<string> {
  const fallback = "Ogni vasca conta: qualità oggi, risultati domani. Forza squadra Master.";
  const modelName = process.env.LOCAL_LLM_MODEL?.trim() || "qwen3:8b";

  const prompt = [
    "Scrivi UNA frase motivazionale breve in italiano per un club nuoto master (35-60 anni).",
    "Tono: concreto, energico, non urlato, niente emoji.",
    "Massimo 22 parole.",
    `Contesto club: ${config.clubId}.`,
    config.motivationPrompt?.trim() ? `Indicazioni extra: ${config.motivationPrompt.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateText({
      messages: [{ role: "user", content: prompt }],
      model: modelName,
      maxTokens: 80,
      temperature: 0.7,
    });
    const text = result.text.trim();
    if (!text) return fallback;
    return text.slice(0, 260);
  } catch (error) {
    logger.warn("[club_ai] motivational text fallback", {
      event: "club_ai:motivation_text_fallback",
      clubId: config.clubId,
      model: modelName,
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

async function runPostMotivationMwf(config: ClubAiConfigRecord): Promise<JobExecutionResult> {
  const text = await generateMotivationalText(config);
  const imageModel = config.imageModel?.trim() || ENV.clubAiPostImageModel || "nano-banana-pro";

  const imagePrompt = [
    "Create a motivational swimming poster for a masters team training in a pool.",
    "High contrast blue water lanes, cinematic sports lighting, no logos, no text overlay.",
    "Vertical composition, dynamic but clean.",
    `Style hint: ${imageModel}.`,
    config.motivationPrompt?.trim() ? `Coach direction: ${config.motivationPrompt.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const imageResult = await generateClubAiImageViaGemini({
    clubId: config.clubId,
    model: imageModel,
    prompt: imagePrompt,
  });
  const imageUrl = imageResult.imageUrl?.trim() ?? "";

  if (imageUrl) {
    logger.info("[club_ai] image generated", {
      event: "club_ai:image_generated",
      clubId: config.clubId,
      model: imageResult.model,
    });
  } else {
    logger.warn("[club_ai] image generation failed, posting text-only fallback", {
      event: "club_ai:image_generation_failed_text_fallback",
      clubId: config.clubId,
      model: imageResult.model,
      reason: imageResult.error ?? "unknown",
    });
  }

  const postId = await createClubPost(
    config.actorUserId,
    config.clubId,
    imageUrl
      ? {
          content: text,
          mediaUrl: imageUrl,
          mediaUrls: [imageUrl],
        }
      : {
          content: text,
        },
  );

  const notification = await notifyClubMembers({
    clubId: config.clubId,
    actorUserId: config.actorUserId,
    type: "club_ai_post",
    title: "Nuovo post del Coach AI",
    message: text,
    link: `/community/club/${config.clubId}`,
    referenceId: postId ? Number(postId) : undefined,
  });

  return {
    status: imageUrl ? "success" : "partial",
    resultJson: {
      posted: true,
      postedTextOnly: !imageUrl,
      postId: postId ?? null,
      imageModel,
      imageUrl: imageUrl || null,
      imageError: imageUrl ? null : imageResult.error ?? "image_generation_failed",
      notification,
    },
  };
}

async function runJob(jobType: ClubAiJobType, config: ClubAiConfigRecord, now: Date): Promise<JobExecutionResult> {
  switch (jobType) {
    case "scan_meets_weekly":
      return runScanMeetsWeekly(config, now);
    case "generate_workouts_weekly":
      return runGenerateWorkoutsWeekly(config, now);
    case "publish_workout_daily":
      return runPublishWorkoutDaily(config, now);
    case "post_motivation_mwf":
      return runPostMotivationMwf(config);
    default:
      return {
        status: "skipped",
        resultJson: {
          reason: `Unhandled job type ${jobType}`,
        },
      };
  }
}

async function executeJobWithRun(params: {
  config: ClubAiConfigRecord;
  now: Date;
  jobType: ClubAiJobType;
  scheduledKey: string;
  payloadJson?: unknown;
}): Promise<ClubRunLog> {
  const createdRun = await createAutomationRun({
    clubId: params.config.clubId,
    jobType: params.jobType,
    scheduledKey: params.scheduledKey,
    actorUserId: params.config.actorUserId,
    payloadJson: params.payloadJson ?? null,
  });

  if (!createdRun.created) {
    return {
      clubId: params.config.clubId,
      jobType: params.jobType,
      status: "skipped",
      runId: createdRun.run.id,
      scheduledKey: params.scheduledKey,
      detail: {
        reason: "idempotent_skip",
      },
    };
  }

  try {
    const execution = await runJob(params.jobType, params.config, params.now);
    await updateAutomationRun({
      runId: createdRun.run.id,
      status: execution.status,
      resultJson: execution.resultJson,
      errorText: execution.errorText ?? null,
    });

    return {
      clubId: params.config.clubId,
      jobType: params.jobType,
      status: execution.status,
      runId: createdRun.run.id,
      scheduledKey: params.scheduledKey,
      detail: execution.resultJson,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateAutomationRun({
      runId: createdRun.run.id,
      status: "failed",
      resultJson: {
        message,
      },
      errorText: message,
    });

    logger.error("[club_ai] job execution failed", {
      event: "club_ai:job_execution_failed",
      clubId: params.config.clubId,
      jobType: params.jobType,
      scheduledKey: params.scheduledKey,
      message,
    });

    return {
      clubId: params.config.clubId,
      jobType: params.jobType,
      status: "failed",
      runId: createdRun.run.id,
      scheduledKey: params.scheduledKey,
      detail: { message },
    };
  }
}

async function bootstrapDefaultClubConfigs() {
  const bootstrapped: Array<{ clubId: number; botUserId: number }> = [];

  for (const clubId of ENV.clubAiDefaultClubIds) {
    try {
      const bot = await ensureClubAiBotUser(clubId);
      const existingConfig = await getClubAiConfigByClubId(clubId);
      if (!existingConfig) {
        await ensureClubAiConfig({
          clubId,
          enabled: true,
          actorUserId: bot.userId,
          timezone: ENV.clubAiTimezone,
          scanSourceUrl: "https://www.nuotosardegna.it/category/comunicati-master/",
          imageModel: ENV.clubAiPostImageModel || null,
        });
      }
      bootstrapped.push({ clubId, botUserId: bot.userId });
    } catch (error) {
      logger.warn("[club_ai] bootstrap failed for club", {
        event: "club_ai:bootstrap_failed",
        clubId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return bootstrapped;
}

const SCHEDULED_JOBS: ClubAiJobType[] = [
  "scan_meets_weekly",
  "generate_workouts_weekly",
  "publish_workout_daily",
  "post_motivation_mwf",
];

export async function runClubAiTick(params?: {
  now?: Date;
  clubIds?: number[];
}) {
  const now = params?.now ?? new Date();

  if (!ENV.clubAiAutomationEnabled) {
    return {
      enabled: false,
      processedClubs: 0,
      runs: [] as ClubRunLog[],
    };
  }

  const bootstrap = await bootstrapDefaultClubConfigs();

  const configs = await listEnabledClubAiConfigs(
    params?.clubIds?.length ? params.clubIds : ENV.clubAiDefaultClubIds.length ? ENV.clubAiDefaultClubIds : undefined,
  );

  const runs: ClubRunLog[] = [];

  for (const configRow of configs) {
    const config = configRow as unknown as ClubAiConfigRecord;
    const clock = getLocalClock(now, config.timezone || ENV.clubAiTimezone);

    for (const jobType of SCHEDULED_JOBS) {
      if (!shouldRunJob(jobType, clock)) continue;
      const scheduledKey = `${clock.dateKey}:${jobType}`;
      const result = await executeJobWithRun({
        config,
        now,
        jobType,
        scheduledKey,
        payloadJson: {
          mode: "scheduled",
          dateKey: clock.dateKey,
          timezone: clock.timezone,
        },
      });
      runs.push(result);
    }
  }

  return {
    enabled: true,
    processedClubs: configs.length,
    bootstrap,
    runs,
  };
}

export async function runClubAiManualJob(params: {
  clubId: number;
  jobType: ClubAiJobType;
  requestedBy: number;
}) {
  const config = await getClubAiConfigByClubId(params.clubId);
  if (!config || !config.enabled) {
    throw new Error("AI coach automation is not enabled for this club");
  }

  const run = await executeJobWithRun({
    config: config as unknown as ClubAiConfigRecord,
    now: new Date(),
    jobType: params.jobType,
    scheduledKey: `manual:${new Date().toISOString()}:${params.jobType}`,
    payloadJson: {
      mode: "manual",
      requestedBy: params.requestedBy,
    },
  });

  return run;
}
