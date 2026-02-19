import { logger } from "../middleware/logger";
import { classifyAsyncError } from "./withErrorHandling";
import { config } from "../config";

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = config.EXTERNAL_API_TIMEOUT_MS,
  context?: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    const { kind, message } = classifyAsyncError(error);
    const level = kind === "unknown" ? "error" : "warn";
    logger.log(level, `[fetchWithTimeout] ${context ?? url} failed (${kind}): ${message}`, {
      event: "fetch:timeout_or_error",
      context: context ?? undefined,
      url,
      timeoutMs,
      kind,
      message,
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

