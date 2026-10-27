import { logger } from "../middleware/logger";

function requireEnv(name: string, fallbackName?: string): string {
  const value = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Required environment variable missing: ${name}`);
    }
    logger.warn(`[env] WARNING: ${name} is not set`);
    return "";
  }
  return value;
}

function parseIntEnv(name: string, fallback: number, options: { min?: number; max?: number } = {}): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    logger.warn(`[env] WARNING: ${name} is not a valid integer, using fallback ${fallback}`);
    return fallback;
  }
  if (options.min !== undefined && parsed < options.min) {
    logger.warn(`[env] WARNING: ${name} below minimum (${options.min}), using fallback ${fallback}`);
    return fallback;
  }
  if (options.max !== undefined && parsed > options.max) {
    logger.warn(`[env] WARNING: ${name} above maximum (${options.max}), using fallback ${fallback}`);
    return fallback;
  }
  return parsed;
}

function parseBoolEnv(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  logger.warn(`[env] WARNING: ${name} is not a valid boolean, using fallback ${String(fallback)}`);
  return fallback;
}

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseOriginList(values: Array<string | undefined | null>): string[] {
  const origins = values
    .flatMap((value) => (value ?? "").split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(origins));
}

function parseIntListEnv(name: string): number[] {
  const raw = process.env[name];
  if (!raw) return [];
  const values = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  return Array.from(new Set(values));
}

function firstNonEmptyEnv(names: string[], fallback: string): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return fallback;
}

// Gemini model names. New Google Cloud projects can no longer call
// gemini-2.5-flash / gemini-3-pro-preview, so the defaults point at the current
// models; existing projects can pin older names through these variables.
const geminiTextModel = firstNonEmptyEnv(["GEMINI_TEXT_MODEL", "GEMINI_MODEL", "FORGE_LLM_MODEL"], "gemini-3.8-flash");
const geminiProModel = firstNonEmptyEnv(["GEMINI_PRO_MODEL"], "gemini-3.1-pro-preview");
const geminiImageModel = firstNonEmptyEnv(["GEMINI_IMAGE_MODEL"], "gemini-3.1-flash-image");
const geminiImageProModel = firstNonEmptyEnv(["GEMINI_IMAGE_PRO_MODEL"], "gemini-3-pro-image-preview");

const sessionMaxAgeDays = parseIntEnv("SESSION_MAX_AGE_DAYS", 30, { min: 1, max: 365 });

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: requireEnv("JWT_SECRET"),
  databaseUrl: requireEnv("DATABASE_URL"),
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  oAuthAllowedRedirectOrigins: parseOriginList([
    process.env.OAUTH_ALLOWED_REDIRECT_ORIGINS,
    process.env.API_URL,
    process.env.RENDER_EXTERNAL_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  forgeLlmModel: firstNonEmptyEnv(["FORGE_LLM_MODEL"], geminiTextModel),
  geminiTextModel,
  geminiProModel,
  geminiImageModel,
  geminiImageProModel,
  supabaseUrl: requireEnv("SUPABASE_URL", "VITE_SUPABASE_URL"),
  supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  imagekitPublicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? "",
  imagekitPrivateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? "",
  imagekitUrlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT ?? "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  cloudinaryVideoCreditWarnPercent: parseIntEnv("CLOUDINARY_VIDEO_CREDIT_WARN_PERCENT", 80, { min: 1, max: 100 }),
  cloudinaryVideoCreditBlockPercent: parseIntEnv("CLOUDINARY_VIDEO_CREDIT_BLOCK_PERCENT", 95, { min: 1, max: 100 }),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  clubBrandingAiEnabled: parseBoolEnv("CLUB_BRANDING_AI_ENABLED", true),
  clubBrandingAiModel: (process.env.CLUB_BRANDING_AI_MODEL ?? "gpt-image-1").trim() || "gpt-image-1",
  clubMeetsV1Enabled: parseBoolEnv("CLUB_MEETS_V1_ENABLED", false),
  clubHistoryV1Enabled: parseBoolEnv("CLUB_HISTORY_V1_ENABLED", false),
  clubAiAutomationEnabled: parseBoolEnv("CLUB_AI_AUTOMATION_ENABLED", false),
  clubAiDefaultClubIds: parseIntListEnv("CLUB_AI_DEFAULT_CLUB_IDS"),
  clubAiTimezone: (process.env.CLUB_AI_TIMEZONE ?? "Europe/Rome").trim() || "Europe/Rome",
  clubAiPostImageEnabled: parseBoolEnv("CLUB_AI_POST_IMAGE_ENABLED", true),
  clubAiPostImageModel: (process.env.CLUB_AI_POST_IMAGE_MODEL ?? "").trim(),
  sessionMaxAgeDays,
  sessionMaxAgeMs: sessionMaxAgeDays * 24 * 60 * 60 * 1000,
};

export function assertAuthEnv() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required.");
  }
}

export function assertSupabaseEnv() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  }
}

export function assertSupabaseServiceEnv() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
}
