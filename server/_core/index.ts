import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { completeChallenges } from "../cron_challenges";
import { evaluateAllUsersWeekly } from "../ai_skill_level";
import { setupSwagger } from "../swagger-setup";
import { connectRedis } from "../lib/cache";
import { assertAuthEnv } from "./env";

// Security middleware
import { requestLogger, errorHandler } from "../middleware/logger";
import { applySecurityMiddleware, applyRateLimiting, loginLimiter } from "../middleware/security";
import { rollbar, captureError } from "../middleware/rollbar-init";

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
    console.warn('[Redis] Connection failed, continuing without cache:', err.message);
  });

  const app = express();
  // Ensure correct client IPs behind Render/other proxies
  app.set("trust proxy", 1);
  const server = createServer(app);

  // Give Redis a moment to connect in background
  await new Promise(resolve => setTimeout(resolve, 500));

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
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "");
    if (process.env.NODE_ENV === "production" && token !== cronSecret) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      const result = await completeChallenges();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Cron] Failed to complete challenges:", error);
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
    const token = authHeader?.toString().replace(/^Bearer\s+/i, "");
    if (process.env.NODE_ENV === "production" && token !== cronSecret) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      const result = await evaluateAllUsersWeekly();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Cron] Failed to evaluate skill level:", error);
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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  // Rollbar error handler (must be after other error handlers)
  app.use((err: any, req: any, res: any, next: any) => {
    captureError(err, {
      url: req.url,
      method: req.method,
      ip: req.ip,
    });
    // Don't send error details to client
    res.status(500).json({ error: "Internal Server Error" });
  });

  // Cron moved to external scheduler via /api/cron/complete-challenges
}

startServer().catch(console.error);
