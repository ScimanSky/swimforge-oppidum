import { COOKIE_NAME, CSRF_COOKIE_NAME, NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { handleError } from "../lib/errors";
import { parse as parseCookieHeader } from "cookie";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
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
  if (process.env.NODE_ENV === "test" || process.env.DISABLE_CSRF_PROTECTION === "true") {
    return opts.next();
  }

  if (opts.type !== "mutation") {
    return opts.next();
  }

  const cookies = parseCookieHeader(opts.ctx.req.headers.cookie ?? "");
  const sessionCookie = cookies[COOKIE_NAME];
  if (!sessionCookie) {
    return opts.next();
  }

  const csrfCookie = cookies[CSRF_COOKIE_NAME];
  const csrfHeaderRaw = opts.ctx.req.headers["x-csrf-token"];
  const csrfHeader = Array.isArray(csrfHeaderRaw) ? csrfHeaderRaw[0] : csrfHeaderRaw;

  if (!csrfCookie || !csrfHeader || csrfHeader !== csrfCookie) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "CSRF validation failed",
    });
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
