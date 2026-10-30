import {
    publicProcedure, protectedProcedure, router, z, db,
    TRPCError, sdk, verifySupabaseAccessToken,
    COOKIE_NAME, getSessionCookieOptions, issueCsrfCookie,
    sql, logger,
} from "./_shared";
import { CSRF_COOKIE_NAME } from "@shared/const";
import { NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE } from "@shared/native";
import { getSupabaseAdminClient } from "../_core/supabase_admin";
import { sendAccountDeletionConfirmationEmail } from "../_core/email";
import { ENV } from "../_core/env";
import { hasRequiredLegalConsents, recordLegalAcceptance } from "../consent";
import { markUserOffline, touchUserPresence } from "../user_presence";
import { deleteFromIfExists } from "../lib/relation-exists";
import { AccountDeletionBlockedError, accountDeletionBlockedMessage } from "../account_clubs";
import { deleteUserDeviceTokens } from "../db_device_tokens";
import { DATA_EXPORT_RATE_LIMIT_MESSAGE, dataExportRateLimit } from "../lib/data-export-rate-limit";
import type { User } from "../../drizzle/schema";

// What auth.me hands to the client about the caller: never the password hash
// nor the session token version.
export function toSelfUser(user: User | null) {
    if (!user) return null;
    return {
        id: user.id,
        openId: user.openId,
        name: user.name,
        email: user.email,
        loginMethod: user.loginMethod,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSignedIn: user.lastSignedIn,
    };
}

const DEV_RESET_EMAIL = (process.env.RESET_APP_ALLOWED_EMAIL ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const RESET_CONFIRMATION_PHRASE = "RESET APP";

/** The Postgres error code of a failed query, also when drizzle wraps the driver error. */
function pgErrorCode(error: unknown): string | undefined {
    const shaped = error as { code?: unknown; cause?: { code?: unknown } } | null;
    const code = shaped?.code ?? shaped?.cause?.code;
    return typeof code === "string" ? code : undefined;
}

/** A Supabase Auth user id (UUID) in users.open_id: the account signs in through Supabase. */
function isSupabaseUserId(openId: string | null | undefined): openId is string {
    return Boolean(openId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(openId));
}

/**
 * The deletion asks for the local password only of a legacy local account. A Supabase account never
 * set one: a password left on its row (the removed local registration) belongs to someone else.
 */
function deletionRequiresPassword(user: Pick<User, "passwordHash" | "openId">): boolean {
    return Boolean(user.passwordHash) && !isSupabaseUserId(user.openId);
}

/** The acceptance could not be stored: no session is issued without it. */
const ACCEPTANCE_NOT_RECORDED_MESSAGE = "Non è stato possibile registrare l'accettazione di Termini e Privacy. Riprova.";

/**
 * The registration checkboxes, ticked by the user: Termini, Privacy and «Dichiaro di avere almeno
 * 14 anni». Only this input records them.
 */
const LEGAL_ACCEPTANCE_SCHEMA = z.object({
    terms: z.literal(true),
    privacy: z.literal(true),
    minimumAge: z.literal(true),
});

export const authRouter = router({
    me: publicProcedure.query(opts => toSelfUser(opts.ctx.user)),

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
            // Sent once the user has ticked the checkboxes (registration form or /auth/consenso).
            legalAcceptance: LEGAL_ACCEPTANCE_SCHEMA.optional(),
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

            // Termini, Privacy and the age are accepted with checkboxes, never recorded on their own:
            // without them (Google sign-in of a new user, or an account that never accepted) no
            // account and no session, the app shows the acceptance step and calls again with it.
            const hasAccepted = user ? await hasRequiredLegalConsents(user.id) : false;
            if (!hasAccepted && !input.legalAcceptance) {
                return { success: false, needsLegalAcceptance: true, isNewUser } as const;
            }

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
                // The row found by email belongs to another identity (open_id null from the removed
                // local registration, a Manus id, a Supabase user deleted and recreated): it goes to
                // the Supabase user who just proved the email, and every session issued before for
                // it is revoked, before the new one exists.
                if (user.openId !== supabaseUser.id) {
                    try {
                        const tokenVersion = await db.relinkUserToSupabaseIdentity(user.id, supabaseUser.id);
                        user = { ...user, openId: supabaseUser.id, passwordHash: null, sessionTokenVersion: tokenVersion };
                    } catch (error) {
                        const duplicate = pgErrorCode(error) === "23505";
                        logger.error("[Auth] Supabase identity not bound to the account", {
                            event: "auth:supabase_relink_failed",
                            userId: user.id,
                            duplicate,
                            message: error instanceof Error ? error.message : String(error),
                        });
                        throw new TRPCError(
                            duplicate
                                ? { code: "CONFLICT", message: "Questo accesso è già collegato a un altro account SwimForge. Scrivi a admin@swimforge.it." }
                                : { code: "INTERNAL_SERVER_ERROR", message: "Accesso non riuscito, riprova." },
                        );
                    }
                }
                // Aggiorna last signed in
                await db.updateUserLastSignedIn(user.id);
            }

            // Right after the account exists and before any session: if the acceptance cannot be
            // recorded, no cookie and no token (the next sign-in asks for it again).
            if (!hasAccepted) {
                try {
                    await recordLegalAcceptance(user.id, ctx.req);
                } catch (error) {
                    logger.error("[Auth] Legal acceptance not recorded at sign-in", {
                        event: "auth:legal_acceptance_record_failed",
                        userId: user.id,
                        message: error instanceof Error ? error.message : String(error),
                    });
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: ACCEPTANCE_NOT_RECORDED_MESSAGE });
                }
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
            const clientHeader = ctx.req.headers[NATIVE_CLIENT_HEADER];
            const isNativeClient = (Array.isArray(clientHeader) ? clientHeader[0] : clientHeader) === NATIVE_CLIENT_VALUE;
            return {
                success: true,
                isNewUser,
                user: { id: user.id, email: user.email, name: user.name },
                ...(isNativeClient ? { sessionToken } : {}),
            };
        }),

    exportMyData: protectedProcedure.query(async ({ ctx }) => {
        // Same per-user budget as GET /api/account/export: a heavy read of the whole account.
        if (!(await dataExportRateLimit.consume(ctx.user.id))) {
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: DATA_EXPORT_RATE_LIMIT_MESSAGE });
        }
        const payload = await db.exportUserData(ctx.user.id);
        return payload;
    }),

    deleteAccountStatus: protectedProcedure.query(async ({ ctx }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Utente non trovato" });
        }

        return {
            requiresPassword: deletionRequiresPassword(user),
            loginMethod: user.loginMethod ?? "email",
            // Clubs with other members: transferred first, or the deletion is refused.
            blockingClubs: await db.getAccountDeletionBlockers(ctx.user.id),
        } as const;
    }),

    logoutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
        await db.incrementSessionTokenVersion(ctx.user.id);
        // Every session is now invalid: no device may keep receiving this user's pushes.
        await deleteUserDeviceTokens(ctx.user.id);
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
            if (!DEV_RESET_EMAIL) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Configura RESET_APP_ALLOWED_EMAIL o ADMIN_EMAIL per abilitare il reset.",
                });
            }

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
                // Every club goes in this reset, shared or not.
                await db.deleteUserAccount(userId, { ownedClubs: "delete" });
            }

            await dbConn.transaction(async (tx) => {
                // Global cleanup for launch reset (dynamic/test data only).
                await deleteFromIfExists(tx, "public.story_views");
                await deleteFromIfExists(tx, "public.story_reactions");
                await deleteFromIfExists(tx, "public.stories");

                await deleteFromIfExists(tx, "public.post_reactions");
                await deleteFromIfExists(tx, "public.social_comments");
                await deleteFromIfExists(tx, "public.social_splashes");
                await deleteFromIfExists(tx, "public.social_hidden_posts");
                await deleteFromIfExists(tx, "public.social_post_reports");
                await deleteFromIfExists(tx, "public.social_follows");
                await deleteFromIfExists(tx, "public.social_posts");

                await deleteFromIfExists(tx, "public.direct_messages");
                await deleteFromIfExists(tx, "public.user_notifications");

                await deleteFromIfExists(tx, "public.event_attendees");
                await deleteFromIfExists(tx, "public.club_announcements");
                await deleteFromIfExists(tx, "public.club_media");
                await deleteFromIfExists(tx, "public.club_events");
                await deleteFromIfExists(tx, "public.community_club_invites");
                await deleteFromIfExists(tx, "public.community_club_members");
                await deleteFromIfExists(tx, "public.community_clubs");

                await deleteFromIfExists(tx, "public.challenge_participants");
                await deleteFromIfExists(tx, "public.challenge_badges");
                await deleteFromIfExists(tx, "public.challenge_activity_log");
                await deleteFromIfExists(tx, "public.challenges");

                // Legacy season engagement tables: created at runtime by the removed season
                // engine, so they may not exist.
                await deleteFromIfExists(tx, "public.season_activity_predictions");
                await deleteFromIfExists(tx, "public.season_club_quest_claims");

                await deleteFromIfExists(tx, "public.ghost_challenges");
                await deleteFromIfExists(tx, "public.garmin_activity_lengths");
                await deleteFromIfExists(tx, "public.garmin_activity_laps");
                await deleteFromIfExists(tx, "public.swimming_activities");

                await deleteFromIfExists(tx, "public.user_badges");
                await deleteFromIfExists(tx, "public.user_achievement_badges");
                await deleteFromIfExists(tx, "public.xp_transactions");
                await deleteFromIfExists(tx, "public.personal_records");
                await deleteFromIfExists(tx, "public.weekly_stats");
                await deleteFromIfExists(tx, "public.user_goals");

                await deleteFromIfExists(tx, "public.ai_insights_cache");
                await deleteFromIfExists(tx, "public.activity_ai_insights");
                await deleteFromIfExists(tx, "public.ai_coach_workouts");

                await deleteFromIfExists(tx, "public.garmin_tokens");
                await deleteFromIfExists(tx, "public.strava_tokens");
                await deleteFromIfExists(tx, "public.user_consents");

                // Reset and preserve the dev identity only.
                await deleteFromIfExists(tx, "public.swimmer_profiles");
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

            // A club with other active members is never deleted with its owner: transfer it first.
            const blockingClubs = await db.getAccountDeletionBlockers(ctx.user.id);
            if (blockingClubs.length > 0) {
                throw new TRPCError({ code: "PRECONDITION_FAILED", message: accountDeletionBlockedMessage(blockingClubs) });
            }

            // Local accounts require password confirmation.
            // OAuth/social accounts can be deleted directly from an authenticated session.
            if (deletionRequiresPassword(user)) {
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
            let deletedUser: Awaited<ReturnType<typeof db.deleteUserAccount>>;
            try {
                deletedUser = await db.deleteUserAccount(ctx.user.id);
            } catch (error) {
                // A member joined one of the clubs meanwhile: nothing was deleted.
                if (error instanceof AccountDeletionBlockedError) {
                    throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
                }
                throw error;
            }
            if (!deletedUser) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Impossibile eliminare l'account",
                });
            }

            // Best effort: delete Supabase Auth user when open_id is a UUID.
            if (isSupabaseUserId(deletedUser.openId)) {
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
