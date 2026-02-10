import { z } from "zod";

/**
 * Centralized runtime config.
 *
 * Keep "required secrets" validation in `server/_core/env.ts` (assertAuthEnv / assertSupabase...).
 * This file is for tunables with safe defaults.
 */
const configSchema = z.object({
  GEMINI_API_TIMEOUT_MS: z.coerce.number().int().positive().catch(60_000),
  GARMIN_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().catch(15_000),
});

export const config = configSchema.parse(process.env);

