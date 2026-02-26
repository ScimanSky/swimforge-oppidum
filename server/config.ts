import { z } from "zod";

/**
 * Centralized runtime config.
 *
 * Keep "required secrets" validation in `server/_core/env.ts` (assertAuthEnv / assertSupabase...).
 * This file is for tunables with safe defaults.
 */
const configSchema = z.object({
  CLUB_WORKOUTS_AI_MODEL_PRIMARY: z.string().trim().min(1).catch("qwen3:8b"),
  CLUB_WORKOUTS_AI_MODEL_ESCALATION: z.string().trim().min(1).catch("qwen3:4b"),
  CLUB_WORKOUTS_AI_QUALITY_THRESHOLD: z.coerce.number().min(0.5).max(1).catch(0.92),
  GEMINI_API_TIMEOUT_MS: z.coerce.number().int().positive().catch(60_000),
  CLUB_WORKOUTS_AI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).catch(45_000),
  CLUB_WORKOUTS_AI_REQUEST_TIMEOUT_SOFT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .catch(30_000),
  LOCAL_LLM_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).catch(45_000),
  LOCAL_LLM_MAX_TOKENS: z.coerce.number().int().min(64).max(8_192).catch(700),
  GARMIN_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().catch(15_000),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().positive().catch(30_000),
});

export const config = configSchema.parse(process.env);
