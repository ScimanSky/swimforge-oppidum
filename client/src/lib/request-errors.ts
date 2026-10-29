import { errorToastMessage } from "@/lib/trpc-errors";

/** Enough of a tRPC client error to read it. */
export type RequestError = {
  message?: unknown;
  data?: {
    code?: unknown;
    zodError?: { formErrors?: string[]; fieldErrors?: Partial<Record<string, string[]>> } | null;
  } | null;
};

/**
 * What a failed form request shows: the input validation messages under their fields (the
 * server's Italian text from `error.data.zodError.fieldErrors`, never the raw zod message),
 * anything else as one message. `serverFields` maps each input field of the procedure to the
 * form field it sits under. A request that never reached the server (no `data`: offline, server
 * down) gets `fallback`, never «Failed to fetch».
 */
export function requestFieldErrors<Field extends string>(
  error: RequestError,
  serverFields: Record<string, Field>,
  fallback: string
): { fields: Partial<Record<Field, string>>; message: string | null } {
  const zod = error.data?.zodError;
  if (zod) {
    const fields: Partial<Record<Field, string>> = {};
    for (const [serverField, field] of Object.entries(serverFields)) {
      const message = zod.fieldErrors?.[serverField]?.[0];
      if (message) fields[field] = message;
    }
    const message = zod.formErrors?.[0] ?? null;
    return Object.keys(fields).length > 0 || message ? { fields, message } : { fields, message: fallback };
  }
  return { fields: {}, message: error.data ? errorToastMessage(error, fallback) : fallback };
}
