import { CSRF_COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { issueCsrfCookie } from "./cookies";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user && process.env.NODE_ENV !== "test") {
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    if (!cookies[CSRF_COOKIE_NAME]) {
      issueCsrfCookie(opts.req, opts.res);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
