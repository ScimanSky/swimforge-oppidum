import { COOKIE_NAME } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";
import { extractBearerToken } from "./bearer";
import { logger } from "../middleware/logger";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const log = logger.child({ component: "sdk" });

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  tokenVersion: number;
};

/**
 * Sessions of the app: signed JWTs (cookie on the web, bearer on the native app) issued only by
 * auth.register and auth.syncSupabaseUser, after Termini, Privacy and the age are recorded. No
 * other path creates accounts or sessions (the Manus OAuth callback and its upsert are gone).
 */
class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret) {
      throw new Error("JWT_SECRET is required.");
    }
    return new TextEncoder().encode(secret);
  }

  /** A session token for the user id (`String(user.id)`). */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; tokenVersion?: number } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "User",
        tokenVersion: options.tokenVersion ?? 1,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ENV.sessionMaxAgeMs;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      tokenVersion: payload.tokenVersion,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; tokenVersion: number } | null> {
    if (!cookieValue) {
      // Missing cookie is expected for anonymous/public requests. Keep it out of warn-level noise.
      log.debug("[Auth] Missing session cookie", {
        event: "auth:missing_session_cookie",
      });
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, tokenVersion } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        log.warn("[Auth] Session payload missing required fields", {
          event: "auth:invalid_session_payload",
        });
        return null;
      }

      return {
        openId,
        appId,
        name,
        tokenVersion: typeof tokenVersion === "number" ? tokenVersion : 1,
      };
    } catch (error) {
      log.warn("[Auth] Session verification failed", {
        event: "auth:session_verification_failed",
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    // Regular authentication flow
    const cookies = this.parseCookies(req.headers.cookie);
    const bearerToken = extractBearerToken(req.headers);
    // A present bearer must never fall back to the cookie: the CSRF middleware exempts bearer requests.
    const sessionCookie = bearerToken ?? cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError(bearerToken ? "Invalid bearer session" : "Invalid session cookie");
    }

    const sessionUserId = session.openId;

    // First try to find user by ID (for email/password auth)
    const userId = parseInt(sessionUserId, 10);
    let user: User | undefined;
    
    if (!isNaN(userId)) {
      user = await db.getUserById(userId);
    }
    
    // Fallback to openId lookup (for OAuth)
    if (!user) {
      user = await db.getUserByOpenId(sessionUserId);
    }

    // A session never creates its user: accounts come only from the registration flows.
    if (!user) {
      throw ForbiddenError("User not found");
    }

    const userTokenVersion = user.sessionTokenVersion ?? 1;
    if (session.tokenVersion !== userTokenVersion) {
      throw ForbiddenError("Session revoked");
    }

    return user;
  }
}

export const sdk = new SDKServer();
