import {
    publicProcedure, protectedProcedure, router, z, db,
    TRPCError, sdk, verifySupabaseAccessToken,
    loginLimiter, registrationLimiter,
    COOKIE_NAME, getSessionCookieOptions, issueCsrfCookie,
    applyRateLimit, sql,
} from "./_shared";
import { CSRF_COOKIE_NAME } from "@shared/const";
import { getSupabaseAdminClient } from "../_core/supabase_admin";
import { sendAccountDeletionConfirmationEmail } from "../_core/email";
import { ENV } from "../_core/env";
import { ensureRequiredLegalConsents } from "../consent";
import { markUserOffline, touchUserPresence } from "../user_presence";

const DEV_RESET_EMAIL = (process.env.RESET_APP_ALLOWED_EMAIL ?? "shardanu@gmail.com").trim().toLowerCase();
const RESET_CONFIRMATION_PHRASE = "RESET APP";
const REGISTRATION_PASSWORD_SCHEMA = z
    .string()
    .min(12, "Password must be at least 12 characters")
    .refine((value) => new TextEncoder().encode(value).length <= 72, "Password must be at most 72 bytes")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*]/, "Password must contain at least one special character");

const isUndefinedTableError = (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    return (error as { code?: string }).code === "42P01";
};

export const authRouter = router({
    me: publicProcedure.query(opts => opts.ctx.user),

    // Register with email and password
    register: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: REGISTRATION_PASSWORD_SCHEMA,
            name: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            await applyRateLimit(registrationLimiter, ctx.req, ctx.res);
            const result = await db.registerUser(input.email, input.password, input.name);

            if (!result.success || !result.user) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: result.error || "Registration failed"
                });
            }

            // Create session token
            const sessionToken = await sdk.createSessionToken(result.user.id.toString(), {
                name: result.user.name || "",
                expiresInMs: ENV.sessionMaxAgeMs,
                tokenVersion: result.user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ENV.sessionMaxAgeMs });
            issueCsrfCookie(ctx.req, ctx.res);

            await ensureRequiredLegalConsents(result.user.id, ctx.req);

            return { success: true, user: { id: result.user.id, email: result.user.email, name: result.user.name } };
        }),

    // Login with email and password
    login: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(1, "Password is required"),
        }))
        .mutation(async ({ ctx, input }) => {
            await applyRateLimit(loginLimiter, ctx.req, ctx.res);
            const result = await db.loginUser(input.email, input.password);

            if (!result.success || !result.user) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: result.error || "Invalid credentials"
                });
            }

            // Create session token
            const sessionToken = await sdk.createSessionToken(result.user.id.toString(), {
                name: result.user.name || "",
                expiresInMs: ENV.sessionMaxAgeMs,
                tokenVersion: result.user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ENV.sessionMaxAgeMs });
            issueCsrfCookie(ctx.req, ctx.res);
            await ensureRequiredLegalConsents(result.user.id, ctx.req);

            return { success: true, user: { id: result.user.id, email: result.user.email, name: result.user.name } };
        }),

    logout: publicProcedure.mutation(async ({ ctx }) => {
        if (ctx.user?.id) {
            try {
                await markUserOffline(ctx.user.id);
            } catch {
                // Non-blocking: logout should still succeed even if presence update fails.
            }
        }
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
        ctx.res.clearCookie(CSRF_COOKIE_NAME, { ...cookieOptions, httpOnly: false });
        return { success: true } as const;
    }),

    heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
        try {
            await touchUserPresence(ctx.user.id);
            return { ok: true } as const;
        } catch {
            // Presence is best-effort in production; never fail the client request.
            return { ok: false } as const;
        }
    }),

    // Sync Supabase OAuth user
    syncSupabaseUser: publicProcedure
        .input(z.object({
            accessToken: z.string(),
            user: z.object({
                id: z.string().min(1),
                email: z.string().email(),
                name: z.string().nullable(),
            }),
        }))
        .mutation(async ({ ctx, input }) => {
            let supabaseUser;
            try {
                supabaseUser = await verifySupabaseAccessToken(input.accessToken);
            } catch {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid Supabase access token",
                });
            }

            const supabaseEmail = supabaseUser.email;
            if (!supabaseEmail) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Supabase user email missing",
                });
            }

            if (input.user.id && input.user.id !== supabaseUser.id) {
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Supabase user mismatch",
                });
            }

            const loginMethod =
                (supabaseUser.app_metadata as Record<string, unknown> | undefined)?.provider ??
                "oauth";
            const userMetadata = supabaseUser.user_metadata as Record<string, unknown> | undefined;
            const displayNameRaw =
                userMetadata?.full_name ||
                userMetadata?.name ||
                input.user.name;
            const displayName =
                typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0
                    ? displayNameRaw
                    : null;

            // Verifica che l'utente esista o crealo
            let user = await db.getUserByEmail(supabaseEmail);
            const isNewUser = !user;

            if (!user) {
                // Crea nuovo utente da OAuth
                const result = await db.createOAuthUser({
                    email: supabaseEmail,
                    name: displayName,
                    supabaseId: supabaseUser.id,
                    loginMethod: String(loginMethod),
                });

                if (!result.success || !result.user) {
                    throw new TRPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Failed to create user",
                    });
                }

                user = result.user;
            } else {
                // Aggiorna last signed in
                await db.updateUserLastSignedIn(user.id);
            }

            // Crea session token
            const sessionToken = await sdk.createSessionToken(user.id.toString(), {
                name: user.name || "",
                expiresInMs: ENV.sessionMaxAgeMs,
                tokenVersion: user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ENV.sessionMaxAgeMs });
            issueCsrfCookie(ctx.req, ctx.res);
            await ensureRequiredLegalConsents(user.id, ctx.req);
            return { success: true, isNewUser, user: { id: user.id, email: user.email, name: user.name } };
        }),

    exportMyData: protectedProcedure.query(async ({ ctx }) => {
        const payload = await db.exportUserData(ctx.user.id);
        return payload;
    }),

    deleteAccountStatus: protectedProcedure.query(async ({ ctx }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Utente non trovato" });
        }

        return {
            requiresPassword: Boolean(user.passwordHash),
            loginMethod: user.loginMethod ?? "email",
        } as const;
    }),

    logoutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
        await db.incrementSessionTokenVersion(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
        return { success: true } as const;
    }),

    resetAppForLaunch: protectedProcedure
        .input(
            z.object({
                confirmation: z.string().min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            if (process.env.NODE_ENV === "production" && process.env.ENABLE_RESET_APP_FOR_LAUNCH !== "true") {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Reset disabilitato in produzione.",
                });
            }

            const currentEmail = (ctx.user.email ?? "").trim().toLowerCase();
            if (currentEmail !== DEV_RESET_EMAIL) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Operazione consentita solo all'account dev." });
            }

            if (input.confirmation.trim() !== RESET_CONFIRMATION_PHRASE) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: `Conferma non valida. Inserisci esattamente: ${RESET_CONFIRMATION_PHRASE}`,
                });
            }

            const preservedUser = await db.getUserByEmail(DEV_RESET_EMAIL);
            if (!preservedUser) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Account dev non trovato. Reset annullato.",
                });
            }

            const dbConn = await db.getDb();
            if (!dbConn) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database non disponibile" });
            }

            const otherUsersResult = await dbConn.execute(sql`
                SELECT id
                FROM users
                WHERE id <> ${preservedUser.id}
            `);
            const otherUserIds = (otherUsersResult.rows as Array<{ id: number }>).map((row) => Number(row.id)).filter((id) => Number.isFinite(id));

            for (const userId of otherUserIds) {
                await db.deleteUserAccount(userId);
            }

            await dbConn.transaction(async (tx) => {
                const deleteIfExists = async (query: ReturnType<typeof sql>) => {
                    try {
                        await tx.execute(query);
                    } catch (error) {
                        if (!isUndefinedTableError(error)) {
                            throw error;
                        }
                    }
                };

                // Global cleanup for launch reset (dynamic/test data only).
                await deleteIfExists(sql`DELETE FROM story_views`);
                await deleteIfExists(sql`DELETE FROM story_reactions`);
                await deleteIfExists(sql`DELETE FROM stories`);

                await deleteIfExists(sql`DELETE FROM post_reactions`);
                await deleteIfExists(sql`DELETE FROM social_comments`);
                await deleteIfExists(sql`DELETE FROM social_splashes`);
                await deleteIfExists(sql`DELETE FROM social_hidden_posts`);
                await deleteIfExists(sql`DELETE FROM social_post_reports`);
                await deleteIfExists(sql`DELETE FROM social_follows`);
                await deleteIfExists(sql`DELETE FROM social_posts`);

                await deleteIfExists(sql`DELETE FROM direct_messages`);
                await deleteIfExists(sql`DELETE FROM user_notifications`);

                await deleteIfExists(sql`DELETE FROM event_attendees`);
                await deleteIfExists(sql`DELETE FROM club_announcements`);
                await deleteIfExists(sql`DELETE FROM club_media`);
                await deleteIfExists(sql`DELETE FROM club_events`);
                await deleteIfExists(sql`DELETE FROM community_club_invites`);
                await deleteIfExists(sql`DELETE FROM community_club_members`);
                await deleteIfExists(sql`DELETE FROM community_clubs`);

                await deleteIfExists(sql`DELETE FROM challenge_participants`);
                await deleteIfExists(sql`DELETE FROM challenge_badges`);
                await deleteIfExists(sql`DELETE FROM challenge_activity_log`);
                await deleteIfExists(sql`DELETE FROM challenges`);

                await deleteIfExists(sql`DELETE FROM season_activity_predictions`);
                await deleteIfExists(sql`DELETE FROM season_club_quest_claims`);

                await deleteIfExists(sql`DELETE FROM ghost_challenges`);
                await deleteIfExists(sql`DELETE FROM garmin_activity_lengths`);
                await deleteIfExists(sql`DELETE FROM garmin_activity_laps`);
                await deleteIfExists(sql`DELETE FROM swimming_activities`);

                await deleteIfExists(sql`DELETE FROM user_badges`);
                await deleteIfExists(sql`DELETE FROM user_achievement_badges`);
                await deleteIfExists(sql`DELETE FROM xp_transactions`);
                await deleteIfExists(sql`DELETE FROM personal_records`);
                await deleteIfExists(sql`DELETE FROM weekly_stats`);

                await deleteIfExists(sql`DELETE FROM ai_insights_cache`);
                await deleteIfExists(sql`DELETE FROM activity_ai_insights`);
                await deleteIfExists(sql`DELETE FROM ai_coach_workouts`);

                await deleteIfExists(sql`DELETE FROM garmin_tokens`);
                await deleteIfExists(sql`DELETE FROM strava_tokens`);
                await deleteIfExists(sql`DELETE FROM user_consents`);

                // Reset and preserve the dev identity only.
                await deleteIfExists(sql`DELETE FROM swimmer_profiles`);
                await tx.execute(sql`DELETE FROM users WHERE id <> ${preservedUser.id}`);
                await tx.execute(sql`
                    UPDATE users
                    SET
                        role = 'admin',
                        updated_at = now(),
                        last_signed_in = now(),
                        session_token_version = COALESCE(session_token_version, 1) + 1
                    WHERE id = ${preservedUser.id}
                `);
                await tx.execute(sql`INSERT INTO swimmer_profiles (user_id) VALUES (${preservedUser.id})`);
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.clearCookie(COOKIE_NAME, cookieOptions);

            return { success: true, preservedEmail: DEV_RESET_EMAIL, deletedUsers: otherUserIds.length } as const;
        }),

    deleteAccount: protectedProcedure
        .input(
            z.object({
                password: z.string().min(1, "Password obbligatoria").optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const user = await db.getUserById(ctx.user.id);
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Utente non trovato" });
            }

            // Local accounts require password confirmation.
            // OAuth/social accounts can be deleted directly from an authenticated session.
            if (user.passwordHash) {
                const password = input.password?.trim() ?? "";
                if (!password) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Password obbligatoria" });
                }
                const passwordValid = await db.verifyUserPassword(ctx.user.id, password);
                if (!passwordValid) {
                    throw new TRPCError({ code: "UNAUTHORIZED", message: "Password non corretta" });
                }
            }

            const deletedAt = new Date();
            const deletedUser = await db.deleteUserAccount(ctx.user.id);
            if (!deletedUser) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Impossibile eliminare l'account",
                });
            }

            // Best effort: delete Supabase Auth user when open_id is a UUID.
            if (deletedUser.openId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deletedUser.openId)) {
                try {
                    const supabaseAdmin = getSupabaseAdminClient();
                    await supabaseAdmin.auth.admin.deleteUser(deletedUser.openId);
                } catch {
                    // ignore: local deletion already completed
                }
            }

            const emailSent = await sendAccountDeletionConfirmationEmail({
                to: deletedUser.email,
                displayName: deletedUser.name,
                deletedAt,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.clearCookie(COOKIE_NAME, cookieOptions);

            return { success: true, emailSent } as const;
        }),
});
