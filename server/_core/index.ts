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

  // Start cron job for challenge completion (runs every hour)
  setInterval(async () => {
    console.log("[Cron] Running challenge completion job...");
    await completeChallenges();
  }, 60 * 60 * 1000); // Every hour

  // Run once on startup
  setTimeout(async () => {
    console.log("[Cron] Initial challenge completion check...");
    await completeChallenges();
  }, 5000); // 5 seconds after startup
}

startServer().catch(console.error);
