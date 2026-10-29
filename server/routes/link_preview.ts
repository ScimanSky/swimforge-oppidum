import { Router, type NextFunction, type Request, type Response } from "express";
import { sdk } from "../_core/sdk";
import {
  LinkPreviewInputError,
  buildLinkPreviewImageProxyUrl,
  fetchLinkPreviewImage,
  fetchLinkPreviewMetadata,
} from "../lib/link_preview";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "link_preview_routes" });

function queryParamToString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" ? first : null;
  }
  return typeof value === "string" ? value : null;
}

/**
 * The previews make the server fetch URLs chosen by the caller: only logged-in users may
 * ask, with the same session check as the tRPC API (bearer token on the native app,
 * session cookie on the web).
 */
async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Accedi per vedere l'anteprima del link." });
    return;
  }
  next();
}

export const linkPreviewRouter = Router();

linkPreviewRouter.get("/api/link-preview", requireSession, async (req, res) => {
  const rawUrl = queryParamToString(req.query.url);
  if (!rawUrl) {
    return res.status(400).json({ error: "Parametro url mancante." });
  }

  try {
    const metadata = await fetchLinkPreviewMetadata(rawUrl);
    return res.json({
      ...metadata,
      imageProxyUrl: metadata.imageUrl ? buildLinkPreviewImageProxyUrl(metadata.imageUrl) : null,
    });
  } catch (error) {
    if (error instanceof LinkPreviewInputError) {
      return res.status(400).json({ error: error.message });
    }

    log.warn("[LinkPreview] Metadata fetch failed", {
      event: "link_preview:metadata_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(502).json({ error: "Anteprima link non disponibile." });
  }
});

linkPreviewRouter.get("/api/link-preview/image", requireSession, async (req, res) => {
  const rawUrl = queryParamToString(req.query.url);
  if (!rawUrl) {
    return res.status(400).json({ error: "Parametro url mancante." });
  }

  try {
    const image = await fetchLinkPreviewImage(rawUrl);
    res.setHeader("Content-Type", image.mimeType);
    // Behind a login now: browsers may cache it, shared caches must not.
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(image.buffer);
  } catch (error) {
    if (error instanceof LinkPreviewInputError) {
      return res.status(400).json({ error: error.message });
    }
    log.warn("[LinkPreview] Image proxy failed", {
      event: "link_preview:image_failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(502).json({ error: "Immagine anteprima non disponibile." });
  }
});
