import { z } from "zod";

/**
 * Centralized runtime config.
 *
 * Keep "required secrets" validation in `server/_core/env.ts` (assertAuthEnv / assertSupabase...).
 * This file is for tunables with safe defaults.
 */
const configSchema = z.object({
  GEMINI_API_TIMEOUT_MS: z.coerce.number().int().positive().catch(60_000),
  CLUB_WORKOUTS_AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).catch(45_000),
  CLUB_WORKOUTS_AI_REQUEST_TIMEOUT_SOFT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .catch(30_000),
  GARMIN_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().catch(15_000),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().catch(30_000),
});

export const config = configSchema.parse(process.env);
