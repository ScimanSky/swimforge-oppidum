/** Enough of a tRPC client error (or any Error) to word a toast. */
type ErrorLike = { message?: unknown; data?: { code?: unknown } | null };

/** The server's role checks fail with these codes and no message of their own. */
const PERMISSION_CODES = new Set(["FORBIDDEN", "UNAUTHORIZED"]);

/**
 * Text of an error toast: the server's own message when it has one, otherwise `fallback`
 * (Italian). A failed role check answers FORBIDDEN or UNAUTHORIZED without a message, so tRPC
 * sends the bare code («FORBIDDEN»), or the db layer's English «Forbidden»: never shown.
 * Any other bare code («NOT_FOUND») gets the fallback too.
 */
export function errorToastMessage(error: unknown, fallback: string): string {
  const shaped = (typeof error === "object" && error !== null ? error : {}) as ErrorLike;
  const code = typeof shaped.data?.code === "string" ? shaped.data.code : "";
  if (PERMISSION_CODES.has(code)) return fallback;
  const message = typeof shaped.message === "string" ? shaped.message.trim() : "";
  if (!message || message === code || /^forbidden$/i.test(message)) return fallback;
  return message;
}
