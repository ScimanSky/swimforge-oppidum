import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "vite" });

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    log.error("Could not find the build directory, make sure to build the client first", {
      event: "vite:missing_dist",
      distPath,
    });
  }

  const assetsPath = path.resolve(distPath, "assets");
  if (fs.existsSync(assetsPath)) {
    app.use(
      "/assets",
      express.static(assetsPath, {
        maxAge: "365d",
        immutable: true,
      })
    );
  }

  app.use(
    express.static(distPath, {
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );

  // Fall through to index.html only for SPA routes.
  // Requests for missing static assets should return 404 (not HTML) to avoid MIME errors.
  app.use("*", (req, res) => {
    if (path.extname(req.path)) {
      return res.status(404).end();
    }
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
