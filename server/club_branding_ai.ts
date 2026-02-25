import OpenAI from "openai";
import { ENV } from "./_core/env";
import { uploadImageToMediaProviders } from "./lib/image_upload";
import { logger } from "./middleware/logger";

export type ClubBrandingAssetKind = "logo" | "cover";

type GenerateClubBrandingAssetParams = {
  clubId: number;
  kind: ClubBrandingAssetKind;
  clubName: string;
  clubTagline?: string | null;
  clubDescription?: string | null;
  themeColor?: string | null;
  customPrompt?: string | null;
  userId: number;
};

type GenerateClubBrandingAssetResult = {
  url: string;
  model: string;
  promptUsed: string;
  width: number;
  height: number;
};

const log = logger.child({ component: "club_branding_ai" });
const DEFAULT_MODEL = "gpt-image-1";
const OPENAI_TIMEOUT_MS = 60_000;
const COVER_TARGET = { width: 1280, height: 640 };
const LOGO_TARGET = { width: 512, height: 512 };

const THEME_COLOR_HINTS: Record<string, string> = {
  cyan: "electric cyan accents",
  lime: "vivid lime accents",
  coral: "warm coral accents",
  violet: "deep violet accents",
};

function sanitizeText(value?: string | null, maxLength = 300): string {
  const trimmed = (value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed.slice(0, maxLength);
}

function buildPrompt(params: GenerateClubBrandingAssetParams): string {
  const clubName = sanitizeText(params.clubName, 120);
  const tagline = sanitizeText(params.clubTagline, 160);
  const description = sanitizeText(params.clubDescription, 260);
  const customPrompt = sanitizeText(params.customPrompt, 320);
  const themeHint = THEME_COLOR_HINTS[(params.themeColor ?? "").trim().toLowerCase()] ?? "aqua and dark blue accents";

  const clubContext = [
    `Club name: ${clubName}.`,
    tagline ? `Tagline: ${tagline}.` : "",
    description ? `Description context: ${description}.` : "",
    customPrompt ? `Coach/style note: ${customPrompt}.` : "",
    `Color direction: ${themeHint}.`,
  ]
    .filter(Boolean)
    .join("\n");

  if (params.kind === "logo") {
    return [
      "Create a premium swimming club logo mark.",
      "Hard constraints:",
      "- No text, letters, numbers, watermark, or signatures.",
      "- Transparent background.",
      "- Single centered symbol, strong silhouette, readable at very small sizes.",
      "- Style: modern, sporty, clean vector-like icon with subtle depth.",
      "- Keep composition balanced inside a square icon.",
      clubContext,
    ].join("\n");
  }

  return [
    "Create a panoramic swimming club cover image for a web app header.",
    "Hard constraints:",
    "- No text, no logos, no watermark.",
    "- Landscape composition with the most important subject in the central safe area.",
    "- Must remain clear when cropped on mobile screens.",
    "- Style: energetic but clean, premium sports aesthetic, not overly busy.",
    "- Focus on swimming pool / lane lines / team training atmosphere.",
    clubContext,
  ].join("\n");
}

async function optimizeGeneratedBuffer(params: {
  buffer: Buffer;
  kind: ClubBrandingAssetKind;
}): Promise<{ buffer: Buffer; mimeType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number }> {
  type SharpPipeline = {
    rotate: () => SharpPipeline;
    resize: (options: { width: number; height: number; fit: "cover" | "inside"; position?: "centre"; withoutEnlargement?: boolean }) => SharpPipeline;
    png: (options: { compressionLevel: number }) => SharpPipeline;
    jpeg: (options: { quality: number }) => SharpPipeline;
    webp: (options: { quality: number }) => SharpPipeline;
    toBuffer: () => Promise<Buffer>;
  };
  type SharpFn = (input: Buffer, options?: { failOn?: "none" | "warning" | "error" }) => SharpPipeline;

  const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
  const sharpFn = ((sharpMod.default ?? sharpMod) as unknown) as SharpFn;

  if (params.kind === "logo") {
    const logo = await sharpFn(params.buffer, { failOn: "none" })
      .rotate()
      .resize({
        width: LOGO_TARGET.width,
        height: LOGO_TARGET.height,
        fit: "cover",
        position: "centre",
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return {
      buffer: logo,
      mimeType: "image/png",
      width: LOGO_TARGET.width,
      height: LOGO_TARGET.height,
    };
  }

  const cover = await sharpFn(params.buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: COVER_TARGET.width,
      height: COVER_TARGET.height,
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 84 })
    .toBuffer();

  return {
    buffer: cover,
    mimeType: "image/webp",
    width: COVER_TARGET.width,
    height: COVER_TARGET.height,
  };
}

export async function generateClubBrandingAsset(
  params: GenerateClubBrandingAssetParams,
): Promise<GenerateClubBrandingAssetResult> {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!ENV.clubBrandingAiEnabled) {
    throw new Error("CLUB_BRANDING_AI_ENABLED is false");
  }

  const model = ENV.clubBrandingAiModel || DEFAULT_MODEL;
  const prompt = buildPrompt(params);
  const size = params.kind === "cover" ? "1536x1024" : "1024x1024";

  const client = new OpenAI({
    apiKey: ENV.openaiApiKey,
    timeout: OPENAI_TIMEOUT_MS,
  });

  const startedAt = Date.now();
  const response = await client.images.generate({
    model,
    prompt,
    size,
    quality: "medium",
    output_format: params.kind === "logo" ? "png" : "webp",
    background: params.kind === "logo" ? "transparent" : "auto",
    user: `club-${params.clubId}-user-${params.userId}`,
  });

  const b64 = response.data?.[0]?.b64_json?.trim();
  if (!b64) {
    throw new Error("OpenAI did not return image data");
  }

  const generatedBuffer = Buffer.from(b64, "base64");
  const optimized = await optimizeGeneratedBuffer({
    buffer: generatedBuffer,
    kind: params.kind,
  });

  const uploaded = await uploadImageToMediaProviders({
    buffer: optimized.buffer,
    mimeType: optimized.mimeType,
    folder: `clubs/${params.clubId}/branding`,
    fileNamePrefix: `club-${params.kind}-ai`,
    tags: ["club-branding", `club-${params.clubId}`, params.kind, "ai", "openai"],
  });

  log.info("[club_branding_ai] generated and uploaded asset", {
    event: "club_branding_ai:generated",
    clubId: params.clubId,
    userId: params.userId,
    kind: params.kind,
    model,
    elapsedMs: Date.now() - startedAt,
    provider: uploaded.provider,
    width: optimized.width,
    height: optimized.height,
  });

  return {
    url: uploaded.url,
    model,
    promptUsed: prompt,
    width: optimized.width,
    height: optimized.height,
  };
}
