import "dotenv/config";
import { timingSafeEqual } from "crypto";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { completeChallenges } from "../cron_challenges";
import { evaluateAllUsersWeekly } from "../ai_skill_level";
import { cleanupExpiredStories } from "../db_stories";
import { cleanupSocialRetention } from "../db_social_enhanced";
import { setupSwagger } from "../swagger-setup";
import { connectRedis } from "../lib/cache";
import { assertAuthEnv } from "./env";
import { healthRouter } from "../routes/health";

// Security middleware
import { requestLogger, errorHandler, logger } from "../middleware/logger";
import { applySecurityMiddleware, applyRateLimiting } from "../middleware/security";
import { rollbar, captureError } from "../middleware/rollbar-init";

const log = logger.child({ component: "server" });

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    assertAuthEnv();
  }
  // Connect to Redis (non-blocking - continue even if it fails)
  connectRedis().catch(err => {
    log.warn("[Redis] Connection failed, continuing without cache", {
      event: "redis:connect_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  });

  const app = express();
  // Ensure correct client IPs behind Render/other proxies
  // Use 1 hop for Render's load balancer (safer than 'true' for rate limiting)
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Give Redis a moment to connect in background
  await new Promise(resolve => setTimeout(resolve, 500));

  // Health/readiness endpoints (mounted before rate limiting)
  app.use(healthRouter);

  // Apply security middleware (CORS, headers, etc.)
  app.use(...applySecurityMiddleware());

  // Apply rate limiting
  app.use(...applyRateLimiting());

  // Request logging
  app.use(requestLogger);

  // Setup Swagger documentation (disable in production unless explicitly enabled)
  const enableSwagger =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_SWAGGER === "true";
  if (enableSwagger) {
    setupSwagger(app);
  }

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Cron endpoint for external scheduler (Render/cron-job.org)
  app.post("/api/cron/complete-challenges", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production" && !cronSecret) {
      return res.status(503).json({ success: false, error: "CRON_SECRET not configured" });
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "") ?? "";
    if (process.env.NODE_ENV === "production") {
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(cronSecret as string);
      if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
    }

    try {
      const result = await completeChallenges();
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      log.error("[Cron] Failed to complete challenges", {
        event: "cron:complete_challenges_failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ success: false, error: "Cron execution failed" });
    }
  });

  // Weekly AI skill level evaluation
  app.post("/api/cron/evaluate-skill-level", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production" && !cronSecret) {
      return res.status(503).json({ success: false, error: "CRON_SECRET not configured" });
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "") ?? "";
    if (process.env.NODE_ENV === "production") {
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(cronSecret as string);
      if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
    }

    try {
      const result = await evaluateAllUsersWeekly();
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      log.error("[Cron] Failed to evaluate skill level", {
        event: "cron:evaluate_skill_level_failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ success: false, error: "Cron execution failed" });
    }
  });

  // Cleanup expired stories and corresponding ImageKit files
  app.post("/api/cron/cleanup-expired-stories", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production" && !cronSecret) {
      return res.status(503).json({ success: false, error: "CRON_SECRET not configured" });
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "") ?? "";
    if (process.env.NODE_ENV === "production") {
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(cronSecret as string);
      if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
    }

    const requestedLimit = Number(req.body?.limit ?? req.query?.limit ?? 300);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 300;

    try {
      const result = await cleanupExpiredStories(limit);
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      log.error("[Cron] Failed to cleanup expired stories", {
        event: "cron:cleanup_expired_stories_failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ success: false, error: "Cron execution failed" });
    }
  });

  // Cleanup old notifications and direct messages
  app.post("/api/cron/cleanup-social-retention", async (req, res) => {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV === "production" && !cronSecret) {
      return res.status(503).json({ success: false, error: "CRON_SECRET not configured" });
    }

    const authHeader = req.headers["authorization"];
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "") ?? "";
    if (process.env.NODE_ENV === "production") {
      const tokenBuf = Buffer.from(token);
      const secretBuf = Buffer.from(cronSecret as string);
      if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
    }

    const notificationRetentionDaysRaw = Number(
      req.body?.notificationRetentionDays ?? req.query?.notificationRetentionDays ?? process.env.NOTIFICATION_RETENTION_DAYS ?? 90
    );
    const dmRetentionDaysRaw = Number(
      req.body?.dmRetentionDays ?? req.query?.dmRetentionDays ?? process.env.DM_RETENTION_DAYS ?? 60
    );
    const limitRaw = Number(
      req.body?.limit ?? req.query?.limit ?? process.env.SOCIAL_RETENTION_BATCH_LIMIT ?? 1000
    );

    const notificationRetentionDays = Number.isFinite(notificationRetentionDaysRaw) ? notificationRetentionDaysRaw : 90;
    const dmRetentionDays = Number.isFinite(dmRetentionDaysRaw) ? dmRetentionDaysRaw : 60;
    const limit = Number.isFinite(limitRaw) ? limitRaw : 1000;

    try {
      const result = await cleanupSocialRetention({
        notificationRetentionDays,
        dmRetentionDays,
        limit,
      });
      return res.json({ success: true, ...result });
    } catch (error: unknown) {
      log.error("[Cron] Failed to cleanup social retention", {
        event: "cron:cleanup_social_retention_failed",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return res.status(500).json({ success: false, error: "Cron execution failed" });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Error handling middleware (must be after routes but before server.listen)
  app.use(errorHandler);

  // Rollbar error handler (must be after other error handlers)
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    const error = err instanceof Error ? err : new Error(String(err));
    captureError(error, {
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
    // Don't send error details to client
    res.status(500).json({ error: "Internal Server Error" });
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    log.warn("Preferred port is busy; using alternate port", {
      event: "server:port_fallback",
      preferredPort,
      port,
    });
  }

  server.listen(port, () => {
    log.info("Server running", {
      event: "server:listening",
      port,
    });
  });

  // Cron moved to external scheduler via /api/cron/complete-challenges
}

startServer().catch((error: unknown) => {
  log.error("Server failed to start", {
    event: "server:start_failed",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});
