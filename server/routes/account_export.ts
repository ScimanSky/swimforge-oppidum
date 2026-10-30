import { Router, type Response } from "express";
import { sdk } from "../_core/sdk";
import { writeUserDataExport } from "../account_export";
import { getDb } from "../db";
import { DATA_EXPORT_RATE_LIMIT_MESSAGE, dataExportRateLimit } from "../lib/data-export-rate-limit";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "account_export_route" });

export class ExportClientClosedError extends Error {
  constructor() {
    super("Client closed the connection");
    this.name = "ExportClientClosedError";
  }
}

const isGone = (res: Response) => res.destroyed || res.writableEnded;

/**
 * Writes a chunk, waiting for the socket to drain when its buffer is full. Once the client is gone
 * it rejects at once: a closed socket never drains, and its `close` has already been emitted.
 */
export function writeExportChunk(res: Response, chunk: string): Promise<void> | void {
  if (isGone(res)) return Promise.reject(new ExportClientClosedError());
  if (res.write(chunk)) return;
  if (isGone(res)) return Promise.reject(new ExportClientClosedError());
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.off("drain", onDrain);
      res.off("close", onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new ExportClientClosedError());
    };
    res.on("drain", onDrain);
    res.on("close", onClose);
  });
}

/**
 * GET /api/account/export: the caller's data (GDPR portability) as a JSON download, streamed page
 * by page (thousands of laps and lengths stay out of memory; Caddy compresses it on the wire).
 * Session as for the tRPC API: cookie on the web, bearer token on the native app.
 */
export const accountExportRouter = Router();

accountExportRouter.get("/api/account/export", async (req, res) => {
  let userId: number;
  try {
    userId = (await sdk.authenticateRequest(req)).id;
  } catch {
    res.status(401).json({ error: "Accedi per esportare i tuoi dati." });
    return;
  }

  if (!(await dataExportRateLimit.consume(userId))) {
    res.status(429).json({ error: DATA_EXPORT_RATE_LIMIT_MESSAGE });
    return;
  }

  const db = await getDb();
  if (!db) {
    res.status(503).json({ error: "Esportazione non disponibile, riprova più tardi." });
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  try {
    await writeUserDataExport(db, userId, (chunk) => {
      if (!res.headersSent) {
        res.status(200);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="swimforge-dati-${day}.json"`);
        res.setHeader("Cache-Control", "no-store");
      }
      return writeExportChunk(res, chunk);
    });
    res.end();
  } catch (error) {
    if (error instanceof ExportClientClosedError) {
      // The download was abandoned: nothing more is read, nothing to answer.
      log.info("[Account export] Client closed the connection, export stopped", {
        event: "account:export_client_closed",
        userId,
      });
      return;
    }
    log.error("[Account export] Export failed", {
      event: "account:export_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).json({ error: "Esportazione non riuscita, riprova più tardi." });
    } else {
      // Half a JSON document must not look like a complete download.
      res.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
});
