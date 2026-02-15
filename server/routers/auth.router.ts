import {
    publicProcedure, protectedProcedure, router, z, db,
    TRPCError, sdk, verifySupabaseAccessToken,
    loginLimiter, registrationLimiter,
    COOKIE_NAME, getSessionCookieOptions,
    ONE_YEAR_MS, applyRateLimit,
} from "./_shared";
import { getSupabaseAdminClient } from "../_core/supabase_admin";
import { isEmailServiceConfigured, sendAccountDeletionConfirmationEmail } from "../_core/email";

export const authRouter = router({
    me: publicProcedure.query(opts => opts.ctx.user),

    // Register with email and password
    register: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(6, "Password must be at least 6 characters"),
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
                expiresInMs: ONE_YEAR_MS,
                tokenVersion: result.user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

            return { success: true, user: { id: result.user.id, email: result.user.email, name: result.user.name } };
        }),

    // Login with email and password
    login: publicProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(1),
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
                expiresInMs: ONE_YEAR_MS,
                tokenVersion: result.user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

            return { success: true, user: { id: result.user.id, email: result.user.email, name: result.user.name } };
        }),

    logout: publicProcedure.mutation(({ ctx }) => {
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
        return { success: true } as const;
    }),

    // Sync Supabase OAuth user
    syncSupabaseUser: publicProcedure
        .input(z.object({
            accessToken: z.string(),
            user: z.object({
                id: z.string(),
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
                expiresInMs: ONE_YEAR_MS,
                tokenVersion: user.sessionTokenVersion ?? 1,
            });

            const cookieOptions = getSessionCookieOptions(ctx.req);
            ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
            return { success: true, isNewUser, user: { id: user.id, email: user.email, name: user.name } };
        }),

    exportMyData: protectedProcedure.query(async ({ ctx }) => {
        const payload = await db.exportUserData(ctx.user.id);
        return payload;
    }),

    logoutAllDevices: protectedProcedure.mutation(async ({ ctx }) => {
        await db.incrementSessionTokenVersion(ctx.user.id);
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.clearCookie(COOKIE_NAME, cookieOptions);
        return { success: true } as const;
    }),

    deleteAccount: protectedProcedure
        .input(
            z.object({
                password: z.string().min(1, "Password obbligatoria"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const user = await db.getUserById(ctx.user.id);
            if (!user) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Utente non trovato" });
            }

            if (!user.passwordHash) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Questo account non usa password locale. Contatta il supporto per l'eliminazione.",
                });
            }

            const passwordValid = await db.verifyUserPassword(ctx.user.id, input.password);
            if (!passwordValid) {
                throw new TRPCError({ code: "UNAUTHORIZED", message: "Password non corretta" });
            }

            if (!isEmailServiceConfigured()) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Servizio email non configurato. Imposta RESEND_API_KEY e RESEND_FROM_EMAIL.",
                });
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
