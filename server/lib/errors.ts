import { TRPCError } from "@trpc/server";
import { logger } from "../middleware/logger";

// Minimal typed wrapper to carry a tRPC error code + message through the codebase.
export class AppError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export function handleError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  if (error instanceof AppError) {
    return new TRPCError({
      code: error.code as any,
      message: error.message,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Unhandled error: ${message}`, {
    event: "trpc:unhandled_error",
    message,
    errorName: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  });

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
}

