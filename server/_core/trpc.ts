import { COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_ERR_MSG, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, z } from "zod";
import type { TrpcContext } from "./context";
import { handleError } from "../lib/errors";
import { parse as parseCookieHeader } from "cookie";
import { extractBearerToken } from "./bearer";
import { shouldEnforceCsrf } from "./csrf";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Input validation errors carry their messages per field (error.data.zodError.fieldErrors),
  // so forms can show each one under its input. Only the messages: never the input values.
  errorFormatter({ shape, error }) {
    const zodError =
      error.code === "BAD_REQUEST" && error.cause instanceof ZodError ? z.flattenError(error.cause) : null;
    return { ...shape, data: { ...shape.data, zodError } };
  },
});

export const router = t.router;
const errorBoundary = t.middleware(async (opts) => {
  try {
    return await opts.next();
  } catch (error) {
    throw handleError(error);
  }
});

const csrfProtection = t.middleware(async (opts) => {
  const cookies = parseCookieHeader(opts.ctx.req.headers.cookie ?? "");
  const enforce = shouldEnforceCsrf({
    type: opts.type,
    hasSessionCookie: Boolean(cookies[COOKIE_NAME]),
    hasBearer: extractBearerToken(opts.ctx.req.headers) !== null,
    env: process.env.NODE_ENV,
    disabled: process.env.DISABLE_CSRF_PROTECTION === "true",
  });
  if (!enforce) return opts.next();
  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeaderRaw = opts.ctx.req.headers["x-csrf-token"];
  const csrfHeader = Array.isArray(csrfHeaderRaw) ? csrfHeaderRaw[0] : csrfHeaderRaw;
  if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
    throw new TRPCError({ code: "FORBIDDEN", message: CSRF_ERR_MSG });
  }
  return opts.next();
});

export const publicProcedure = t.procedure.use(errorBoundary).use(csrfProtection);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(errorBoundary).use(requireUser).use(csrfProtection);

export const adminProcedure = t.procedure.use(errorBoundary).use(csrfProtection).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
