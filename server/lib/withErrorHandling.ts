import { logger } from "../middleware/logger";

export type ErrorKind = "timeout" | "network" | "unknown";

export function classifyAsyncError(error: unknown): { kind: ErrorKind; message: string } {
  if (error instanceof Error) {
    const message = error.message || error.name;
    const name = error.name || "";

    if (name === "AbortError" || /timeout/i.test(message)) {
      return { kind: "timeout", message };
    }

    // Node fetch/network errors often surface as TypeError with a cause/code
    const anyErr = error as any;
    const code = typeof anyErr?.code === "string" ? anyErr.code : "";
    if (code && ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
      return { kind: "network", message: `${message} (${code})` };
    }

    return { kind: "unknown", message };
  }

  return { kind: "unknown", message: String(error) };
}

/**
 * Best-effort wrapper for non-critical async operations.
 * Logs a structured error and returns a fallback value.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  fallback: T,
  context: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const { kind, message } = classifyAsyncError(error);
    const level = kind === "unknown" ? "error" : "warn";
    logger.log(level, `[withErrorHandling] ${context} failed (${kind}): ${message}`, {
      event: "async:with_error_handling",
      context,
      kind,
      message,
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return fallback;
  }
}
