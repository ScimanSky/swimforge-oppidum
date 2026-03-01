import {
    protectedProcedure, router, z, db, getDb,
    TRPCError, eq,
    getOrSetCached, cacheKeys, CACHE_TTL,
    sanitizeActivityNotes, logger,
    garmin,
} from "./_shared";
import type { SwimmingActivityInsert } from "./_shared";

export const activitiesRouter = router({
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(100).default(20),
            offset: z.number().min(0).default(0),
            source: z.enum(["all", "garmin", "strava", "manual"]).optional().default("all"),
            openWater: z.boolean().optional(),
            strokeType: z.enum(["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]).optional(),
            minDistanceMeters: z.number().min(0).optional(),
            maxDistanceMeters: z.number().min(0).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const cacheKey = [
                String(ctx.user.id),
                input.limit,
                input.offset,
                input.source ?? "all",
                input.openWater ?? "any",
                input.strokeType ?? "any",
                input.minDistanceMeters ?? "min",
                input.maxDistanceMeters ?? "max",
            ].join(":");

            return await getOrSetCached(
                cacheKeys.activities(cacheKey, input.limit, input.offset),
                () =>
                    db.getActivities(ctx.user.id, input.limit, input.offset, {
                        source: input.source,
                        openWater: input.openWater,
                        strokeType: input.strokeType,
                        minDistanceMeters: input.minDistanceMeters,
                        maxDistanceMeters: input.maxDistanceMeters,
                    }),
                CACHE_TTL.ACTIVITIES
            );
        }),

    get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ ctx, input }) => {
            let activity = await db.getActivityById(input.id);
            let garminLaps: Array<{
                lapIndex: number | null;
                distanceMeters: number | null;
                durationSeconds: number | null;
                movingDurationSeconds: number | null;
                elapsedDurationSeconds: number | null;
                averageSpeedMps: number | null;
                maxSpeedMps: number | null;
                averageMovingSpeedMps: number | null;
                averageSwolf: number | null;
                averageStrokes: number | null;
                totalNumberOfStrokes: number | null;
                averageSwimCadence: number | null;
                calories: number | null;
                avgHeartRate: number | null;
                maxHeartRate: number | null;
                numberOfActiveLengths: number | null;
                strokeType: string | null;
                startTimeGmt: Date | null;
            }> = [];

            if (!activity || activity.userId !== ctx.user.id) {
                throw new TRPCError({ code: "NOT_FOUND" });
            }
            if (activity.activitySource === "garmin" && activity.garminActivityId) {
                const rawData = (activity.rawData ?? {}) as Record<string, unknown>;
                const existingDetails = rawData["garmin_details"];
                const hasExistingDetails =
                    existingDetails && typeof existingDetails === "object" && Object.keys(existingDetails).length > 0;
                const hasSummary = (() => {
                    if (!existingDetails || typeof existingDetails !== "object") return false;
                    const detailsObj = existingDetails as Record<string, unknown>;
                    const activityObj = detailsObj["activity"];
                    if (activityObj && typeof activityObj === "object") {
                        const activityRec = activityObj as Record<string, unknown>;
                        if (activityRec["summaryDTO"] !== null && activityRec["summaryDTO"] !== undefined) return true;
                    }
                    if (detailsObj["summaryDTO"] !== null && detailsObj["summaryDTO"] !== undefined) return true;
                    return false;
                })();

                const fetchedDetails = (!hasExistingDetails || !hasSummary)
                    ? await garmin.getGarminActivityFullDetails(
                        ctx.user.id,
                        activity.garminActivityId
                    )
                    : null;

                const fullDetails =
                    fetchedDetails ??
                    (hasExistingDetails ? existingDetails : null);

                if (fullDetails) {
                    const nextRawData = hasExistingDetails
                        ? rawData
                        : {
                            ...rawData,
                            garmin_details: fullDetails,
                        };

                    const advanced = garmin.extractGarminAdvancedFields(fullDetails);
                    const updates: Partial<SwimmingActivityInsert> = {};

                    const setIfMissing = <K extends keyof SwimmingActivityInsert>(
                        key: K,
                        value: SwimmingActivityInsert[K]
                    ) => {
                        const current = (activity as unknown as Record<string, unknown>)[String(key)];
                        if (value === null || value === undefined) return;
                        if (current === null || current === undefined || current === 0) {
                            updates[key] = value;
                        }
                    };

                    setIfMissing("avgSwolf", advanced.avgSwolf);
                    setIfMissing("avgStrokeDistance", advanced.avgStrokeDistance);
                    setIfMissing("avgStrokes", advanced.avgStrokes);
                    setIfMissing("avgStrokeCadence", advanced.avgStrokeCadence);
                    setIfMissing("trainingEffect", advanced.trainingEffect);
                    setIfMissing("anaerobicTrainingEffect", advanced.anaerobicTrainingEffect);
                    setIfMissing("vo2MaxValue", advanced.vo2MaxValue);
                    setIfMissing("recoveryTimeHours", advanced.recoveryTimeHours);
                    setIfMissing("avgStress", advanced.avgStress);
                    setIfMissing("avgHeartRate", advanced.avgHeartRate);
                    setIfMissing("maxHeartRate", advanced.maxHeartRate);
                    setIfMissing("restingHeartRate", advanced.restingHeartRate);
                    setIfMissing("lapsCount", advanced.lapsCount);
                    setIfMissing("poolLengthMeters", advanced.poolLengthMeters);
                    if (advanced.strokeType && (!activity.strokeType || activity.strokeType === "mixed")) {
                        const STROKE_TYPES = ["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"] as const;
                        type StrokeType = (typeof STROKE_TYPES)[number];
                        const nextStroke = String(advanced.strokeType).toLowerCase() as StrokeType;
                        if ((STROKE_TYPES as readonly string[]).includes(nextStroke)) {
                            updates.strokeType = nextStroke;
                        }
                    }

                    if (advanced.hrZones) {
                        const hrValues = Object.values(advanced.hrZones);
                        const hasZones = hrValues.some((value) => Number(value) > 0);
                        if (hasZones) {
                            if (!activity.hrZone1Seconds) updates.hrZone1Seconds = advanced.hrZones.hrZone1Seconds;
                            if (!activity.hrZone2Seconds) updates.hrZone2Seconds = advanced.hrZones.hrZone2Seconds;
                            if (!activity.hrZone3Seconds) updates.hrZone3Seconds = advanced.hrZones.hrZone3Seconds;
                            if (!activity.hrZone4Seconds) updates.hrZone4Seconds = advanced.hrZones.hrZone4Seconds;
                            if (!activity.hrZone5Seconds) updates.hrZone5Seconds = advanced.hrZones.hrZone5Seconds;
                        }
                    }

                    const dbInstance = await getDb();
                    if (dbInstance) {
                        const { swimmingActivities, garminActivityLaps } = await import("../../drizzle/schema");
                        if (Object.keys(updates).length > 0 || nextRawData !== rawData) {
                            await dbInstance
                                .update(swimmingActivities)
                                .set({ ...updates, rawData: nextRawData })
                                .where(eq(swimmingActivities.id, activity.id));
                            activity = { ...activity, ...updates, rawData: nextRawData } as typeof activity;
                        } else if (rawData["garmin_details"]) {
                            activity.rawData = rawData;
                        }

                        try {
                            const existingLap = await dbInstance
                                .select({ id: garminActivityLaps.id })
                                .from(garminActivityLaps)
                                .where(eq(garminActivityLaps.activityId, activity.id))
                                .limit(1);
                            if (existingLap.length === 0) {
                                await garmin.persistGarminLapDetails(
                                    dbInstance,
                                    activity.id,
                                    fullDetails
                                );
                            }
                        } catch (error) {
                            logger.warn("[Garmin] Failed to persist lap details", {
                                event: "garmin:persist_lap_details_failed",
                                message: error instanceof Error ? error.message : String(error),
                                stack: error instanceof Error ? error.stack : undefined,
                            });
                        }
                    } else if (rawData.garmin_details) {
                        activity.rawData = rawData;
                    }
                }
            }

            if (activity.activitySource === "garmin") {
                const dbInstance = await getDb();
                if (dbInstance) {
                    const { garminActivityLaps } = await import("../../drizzle/schema");
                    garminLaps = await dbInstance
                        .select({
                            lapIndex: garminActivityLaps.lapIndex,
                            distanceMeters: garminActivityLaps.distanceMeters,
                            durationSeconds: garminActivityLaps.durationSeconds,
                            movingDurationSeconds: garminActivityLaps.movingDurationSeconds,
                            elapsedDurationSeconds: garminActivityLaps.elapsedDurationSeconds,
                            averageSpeedMps: garminActivityLaps.averageSpeedMps,
                            maxSpeedMps: garminActivityLaps.maxSpeedMps,
                            averageMovingSpeedMps: garminActivityLaps.averageMovingSpeedMps,
                            averageSwolf: garminActivityLaps.averageSwolf,
                            averageStrokes: garminActivityLaps.averageStrokes,
                            totalNumberOfStrokes: garminActivityLaps.totalNumberOfStrokes,
                            averageSwimCadence: garminActivityLaps.averageSwimCadence,
                            calories: garminActivityLaps.calories,
                            avgHeartRate: garminActivityLaps.avgHeartRate,
                            maxHeartRate: garminActivityLaps.maxHeartRate,
                            numberOfActiveLengths: garminActivityLaps.numberOfActiveLengths,
                            strokeType: garminActivityLaps.strokeType,
                            startTimeGmt: garminActivityLaps.startTimeGmt,
                        })
                        .from(garminActivityLaps)
                        .where(eq(garminActivityLaps.activityId, activity.id))
                        .orderBy(garminActivityLaps.lapIndex);
                }
            }

            return {
                ...activity,
                garminLaps,
            };
        }),

    // Manual activity creation disabled to prevent cheating
    create: protectedProcedure
        .input(z.object({
            // Keep schema for documentation purposes
            activityDate: z.string().transform(s => new Date(s)),
            distanceMeters: z.number().min(0),
            durationSeconds: z.number().min(0),
            poolLengthMeters: z.number().optional(),
            strokeType: z.enum(["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]).optional(),
            avgPacePer100m: z.number().optional(),
            calories: z.number().optional(),
            avgHeartRate: z.number().optional(),
            maxHeartRate: z.number().optional(),
            swolfScore: z.number().optional(),
            lapsCount: z.number().optional(),
            isOpenWater: z.boolean().default(false),
            location: z.string().optional(),
            notes: z.string().max(5000).optional().transform((s) => (s ? sanitizeActivityNotes(s) : s)),
        }))
        .mutation(async () => {
            // Manual activity creation is disabled - use Garmin Connect or Strava sync
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "L'inserimento manuale delle attività è disabilitato. Collega Garmin Connect o Strava."
            });
        }),

    updateNotes: protectedProcedure
        .input(z.object({
            id: z.number(),
            notes: z.string().max(5000).transform((s) => sanitizeActivityNotes(s)),
        }))
        .mutation(async ({ ctx, input }) => {
            const activity = await db.getActivityById(input.id);
            if (!activity || activity.userId !== ctx.user.id) {
                throw new TRPCError({ code: "NOT_FOUND" });
            }
            await db.updateActivity(input.id, { notes: input.notes });
            return { success: true };
        }),
});
