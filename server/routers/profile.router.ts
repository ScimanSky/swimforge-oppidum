import {
    protectedProcedure, router, z, db,
    TRPCError,
    normalizeBooleanRecord, coerceBoolean, detectImageType,
    logger,
} from "./_shared";
import type { SwimmingActivityInsert } from "./_shared";

export const profileRouter = router({
    get: protectedProcedure.query(async ({ ctx }) => {
        const profile = await db.getSwimmerProfile(ctx.user.id);
        if (!profile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
        }

        const nextLevel = await db.getNextLevelThreshold(profile.level);
        const currentLevelInfo = await db.getLevelForXp(profile.totalXp);

        // Get profile badge
        const { getUserProfileBadge, updateUserProfileBadge, updateUserProfileBadgeByLevel } = await import("../db_profile_badges");
        let profileBadge = await getUserProfileBadge(ctx.user.id);

        // If user doesn't have a profile badge, assign based on AI skill level if available; fallback to XP
        if (!profileBadge) {
            if (profile.aiSkillLevel) {
                await updateUserProfileBadgeByLevel(ctx.user.id, profile.aiSkillLevel);
            } else {
                await updateUserProfileBadge(ctx.user.id, profile.totalXp);
            }
            profileBadge = await getUserProfileBadge(ctx.user.id);
        }

        return {
            ...profile,
            notificationSettings: normalizeBooleanRecord(profile.notificationSettings),
            levelTitle: currentLevelInfo.title,
            levelColor: currentLevelInfo.color,
            xpLevelTitle: currentLevelInfo.title,
            xpLevelColor: currentLevelInfo.color,
            xpLevel: profile.level,
            nextLevelXp: nextLevel?.xpRequired || null,
            xpToNextLevel: nextLevel ? nextLevel.xpRequired - profile.totalXp : 0,
            profileBadge,
        };
    }),

    update: protectedProcedure
        .input(z.object({
            name: z.string().min(1).max(120).optional(),
            email: z.string().email().optional(),
            avatarUrl: z.string().optional(),
            coverUrl: z.string().optional(),
            bio: z.string().optional(),
            location: z.string().optional(),
            lastName: z.string().max(120).optional(),
            username: z.string().max(60).optional(),
            birthDate: z.string().optional().nullable(),
            preferredStroke: z.enum(["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"]).optional().nullable(),
            preferredPoolLengthMeters: z.number().int().positive().optional().nullable(),
            masterCategory: z.string().max(120).optional(),
            notificationSettings: z
                .record(
                    z.string(),
                    z.preprocess((raw) => {
                        const coerced = coerceBoolean(raw);
                        return coerced === undefined ? raw : coerced;
                    }, z.boolean())
                )
                .optional(),
            preferences: z.object({
                units: z.enum(["metric", "imperial"]).optional(),
                paceFormat: z.enum(["100m", "100y"]).optional(),
                language: z.enum(["it", "en", "es", "fr"]).optional(),
                timezone: z.string().optional(),
            }).optional(),
            privacySettings: z.object({
                profilePublic: z.boolean().optional(),
                activitiesPublic: z.boolean().optional(),
                showLeaderboards: z.boolean().optional(),
            }).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const {
                name,
                email,
                notificationSettings,
                preferences,
                privacySettings,
                ...profilePayload
            } = input;

            if (email) {
                const normalizedEmail = email.toLowerCase().trim();
                if (normalizedEmail !== ctx.user.email?.toLowerCase()) {
                    const existing = await db.getUserByEmail(normalizedEmail);
                    if (existing && existing.id !== ctx.user.id) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message: "Email gia in uso da un altro account.",
                        });
                    }
                    await db.updateUser(ctx.user.id, { email: normalizedEmail });
                }
            }

            if (name !== undefined) {
                const trimmedName = name.trim();
                if (trimmedName !== (ctx.user.name || "")) {
                    await db.updateUser(ctx.user.id, { name: trimmedName || null });
                }
            }

            await db.updateSwimmerProfile(ctx.user.id, {
                ...profilePayload,
                notificationSettings,
                preferences,
                privacySettings,
            });
            return { success: true };
        }),
    uploadMedia: protectedProcedure
        .input(
            z.object({
                kind: z.enum(["avatar", "cover"]),
                // Base64 has ~33% overhead; enforce at input layer and re-check decoded size.
                fileBase64: z
                    .string()
                    .min(1)
                    .max(7 * 1024 * 1024, "File troppo grande (max 5MB)")
                    .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
                mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
                extension: z.enum(["jpg", "jpeg", "png", "webp"]).optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { getSupabaseAdminClient } = await import("../_core/supabase_admin");
            const admin = getSupabaseAdminClient();

            const MAX_BYTES = 5 * 1024 * 1024;
            let buffer: Buffer;
            try {
                buffer = Buffer.from(input.fileBase64, "base64");
            } catch {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
            }
            if (buffer.length > MAX_BYTES) {
                throw new TRPCError({
                    code: "PAYLOAD_TOO_LARGE",
                    message: "File troppo grande (max 5MB)",
                });
            }

            const detected = detectImageType(buffer);
            if (!detected) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Formato immagine non supportato. Usa JPG, PNG o WEBP.",
                });
            }
            if (detected.mimeType !== input.mimeType) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Il MIME type non corrisponde al contenuto del file.",
                });
            }

            // Resize (max 1920x1080) to reduce payload + prevent huge images.
            try {
                type SharpPipeline = {
                    rotate: () => SharpPipeline;
                    resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
                    jpeg: (options: { quality: number }) => SharpPipeline;
                    png: (options: { compressionLevel: number }) => SharpPipeline;
                    webp: (options: { quality: number }) => SharpPipeline;
                    toBuffer: () => Promise<Buffer>;
                };
                type SharpFn = (input: Buffer) => SharpPipeline;

                const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
                const sharpFn = ((sharpMod.default ?? sharpMod) as unknown) as SharpFn;
                const pipeline = sharpFn(buffer)
                    .rotate()
                    .resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true });

                if (detected.extension === "jpg") {
                    buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
                } else if (detected.extension === "png") {
                    buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
                } else {
                    buffer = await pipeline.webp({ quality: 85 }).toBuffer();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                // Best-effort: if resize fails, upload original buffer (still size-limited above).
                logger.warn(`uploadMedia: image resize failed: ${message}`, {
                    event: "profile:upload_resize_failed",
                    userId: ctx.user.id,
                    kind: input.kind,
                    message,
                });
            }

            const filePath = `profiles/${ctx.user.id}/${input.kind}-${Date.now()}.${detected.extension}`;
            const { error } = await admin.storage
                .from("profile-media")
                .upload(filePath, buffer, {
                    contentType: detected.mimeType,
                    upsert: true,
                });
            if (error) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Upload failed: ${error.message}`,
                });
            }
            const { data } = admin.storage.from("profile-media").getPublicUrl(filePath);
            return { url: data.publicUrl };
        }),

    refreshStats: protectedProcedure
        .mutation(async ({ ctx }) => {
            // Recalculate all stats from activities (DB aggregates)
            const aggregates = await db.getActivityAggregates(ctx.user.id);

            await db.updateSwimmerProfile(ctx.user.id, {
                totalDistanceMeters: aggregates.totalDistance,
                totalTimeSeconds: aggregates.totalTime,
                totalSessions: aggregates.totalSessions,
                totalOpenWaterSessions: aggregates.totalOpenWaterSessions,
                totalOpenWaterMeters: aggregates.totalOpenWaterMeters,
            });

            return {
                success: true,
                stats: {
                    totalDistance: aggregates.totalDistance,
                    totalTime: aggregates.totalTime,
                    totalSessions: aggregates.totalSessions,
                    totalOpenWaterSessions: aggregates.totalOpenWaterSessions,
                    totalOpenWaterMeters: aggregates.totalOpenWaterMeters,
                }
            };
        }),
});
