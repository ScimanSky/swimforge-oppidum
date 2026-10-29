import { CSRF_ERR_MSG, NOT_ADMIN_ERR_MSG } from "@shared/const";

/** Enough of a tRPC client error (or any Error) to word a toast. */
type ErrorLike = { message?: unknown; data?: { code?: unknown } | null };

/** FORBIDDEN messages meant for developers (English): the admin check and the CSRF guard. */
const TECHNICAL_FORBIDDEN = new Set([NOT_ADMIN_ERR_MSG, CSRF_ERR_MSG]);

/**
 * Text of an error toast (or notice): the server's own message when it has one, otherwise
 * `fallback` (Italian). A failed role check answers FORBIDDEN without a message, so tRPC sends
 * the bare code («FORBIDDEN»), or the db layer's English «Forbidden»: never shown, nor the
 * English admin and CSRF checks; a FORBIDDEN with a reason of its own («Devi iscriverti al club
 * per visualizzare i contenuti.») keeps it. UNAUTHORIZED always gets the fallback (the session's
 * messages are English). Any other bare code («NOT_FOUND») gets the fallback too.
 */
export function errorToastMessage(error: unknown, fallback: string): string {
  const shaped = (typeof error === "object" && error !== null ? error : {}) as ErrorLike;
  const code = typeof shaped.data?.code === "string" ? shaped.data.code : "";
  if (code === "UNAUTHORIZED") return fallback;
  const message = typeof shaped.message === "string" ? shaped.message.trim() : "";
  if (!message || message === code || /^forbidden$/i.test(message)) return fallback;
  if (code === "FORBIDDEN" && TECHNICAL_FORBIDDEN.has(message)) return fallback;
  return message;
}
