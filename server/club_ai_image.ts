import { GoogleGenAI, Modality, type GenerateContentResponse, type Part } from "@google/genai";
import { createHash } from "crypto";
import { ENV } from "./_core/env";
import { logger } from "./middleware/logger";

type GenerateClubAiImageViaGeminiParams = {
  clubId: number;
  prompt: string;
  model?: string | null;
};

type GenerateClubAiImageViaGeminiResult = {
  provider: "gemini";
  model: string;
  imageUrl?: string;
  error?: string;
};

const log = logger.child({ component: "club_ai_image" });
const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const LEGACY_NANO_BANANA_ALIASES = new Set(["nano-banana", "nano-banana-pro", "nanobanana", "nanobanana-pro"]);
const IMAGE_MODEL_FALLBACKS = ["gemini-2.5-flash-image", "gemini-3-pro-image-preview"];
const TARGET_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

function sanitizeSlug(input: string): string {
  const compact = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return compact || "poster";
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  return "png";
}

function normalizeMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (!normalized.startsWith("image/")) return "image/png";
  return normalized;
}

function dataUriFromBuffer(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function optimizeImageBuffer(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (buffer.length <= TARGET_UPLOAD_MAX_BYTES) {
    return { buffer, mimeType };
  }

  try {
    type SharpPipeline = {
      rotate: () => SharpPipeline;
      resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
      webp: (options: { quality: number }) => SharpPipeline;
      jpeg: (options: { quality: number }) => SharpPipeline;
      toBuffer: () => Promise<Buffer>;
    };
    type SharpFn = (input: Buffer, options?: { failOn?: "none" | "warning" | "error" }) => SharpPipeline;
    const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
    const sharpFn = ((sharpMod.default ?? sharpMod) as unknown) as SharpFn;

    const candidates: Array<{ width: number; height: number; format: "webp" | "jpeg"; quality: number; mimeType: string }> = [
      { width: 1600, height: 1600, format: "webp", quality: 82, mimeType: "image/webp" },
      { width: 1400, height: 1400, format: "webp", quality: 74, mimeType: "image/webp" },
      { width: 1200, height: 1200, format: "jpeg", quality: 72, mimeType: "image/jpeg" },
      { width: 1024, height: 1024, format: "jpeg", quality: 64, mimeType: "image/jpeg" },
    ];

    for (const candidate of candidates) {
      let pipeline = sharpFn(buffer, { failOn: "none" })
        .rotate()
        .resize({ width: candidate.width, height: candidate.height, fit: "inside", withoutEnlargement: true });

      if (candidate.format === "webp") {
        pipeline = pipeline.webp({ quality: candidate.quality });
      } else {
        pipeline = pipeline.jpeg({ quality: candidate.quality });
      }

      const compressed = await pipeline.toBuffer();
      if (compressed.length <= TARGET_UPLOAD_MAX_BYTES) {
        return {
          buffer: compressed,
          mimeType: candidate.mimeType,
        };
      }
    }

    // If all candidates are still large, return the smallest one.
    const smallest = await sharpFn(buffer, { failOn: "none" })
      .rotate()
      .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 56 })
      .toBuffer();
    return { buffer: smallest, mimeType: "image/jpeg" };
  } catch (error) {
    log.warn("[club_ai] image optimization failed, using original buffer", {
      event: "club_ai:image_optimization_failed",
      message: error instanceof Error ? error.message : String(error),
      originalSizeBytes: buffer.length,
    });
    return { buffer, mimeType };
  }
}

async function uploadToImageKit(params: {
  clubId: number;
  fileSlug: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ imageUrl?: string; error?: string }> {
  if (!ENV.imagekitPrivateKey) {
    return { error: "IMAGEKIT_PRIVATE_KEY not configured" };
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${ENV.imagekitPrivateKey}:`).toString("base64")}`;
    const extension = extensionFromMimeType(params.mimeType);
    const folder = `/clubs/${params.clubId}/ai-posts`;
    const fileName = `${Date.now()}-${params.fileSlug}.${extension}`;

    const formData = new FormData();
    formData.append("file", dataUriFromBuffer(params.buffer, params.mimeType));
    formData.append("fileName", fileName);
    formData.append("folder", folder);
    formData.append("useUniqueFileName", "false");
    formData.append("tags", `club,club-${params.clubId},ai-post`);

    const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      headers: {
        Authorization: authHeader,
      },
      body: formData,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `ImageKit upload failed (${res.status}): ${detail || res.statusText}` };
    }

    const payload = (await res.json()) as { url?: string };
    const imageUrl = payload.url?.trim();
    if (!imageUrl) {
      return { error: "ImageKit upload returned empty URL" };
    }
    return { imageUrl };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function uploadToCloudinary(params: {
  clubId: number;
  fileSlug: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ imageUrl?: string; error?: string }> {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    return { error: "Cloudinary credentials not configured" };
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `clubs/${params.clubId}/ai-posts`;
    const extension = extensionFromMimeType(params.mimeType);
    const publicId = `${params.fileSlug}-${createHash("sha1").update(String(Date.now())).digest("hex").slice(0, 10)}`;
    const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${ENV.cloudinaryApiSecret}`;
    const signature = createHash("sha1").update(signaturePayload).digest("hex");

    const formData = new FormData();
    formData.append("file", dataUriFromBuffer(params.buffer, params.mimeType));
    formData.append("api_key", ENV.cloudinaryApiKey);
    formData.append("timestamp", String(timestamp));
    formData.append("folder", folder);
    formData.append("public_id", publicId);
    formData.append("signature", signature);
    formData.append("resource_type", "image");
    formData.append("format", extension);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${ENV.cloudinaryCloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Cloudinary upload failed (${res.status}): ${detail || res.statusText}` };
    }

    const payload = (await res.json()) as { secure_url?: string; url?: string };
    const imageUrl = payload.secure_url?.trim() || payload.url?.trim() || "";
    if (!imageUrl) {
      return { error: "Cloudinary upload returned empty URL" };
    }
    return { imageUrl };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractInlineData(response: GenerateContentResponse): { data: string; mimeType: string } | null {
  const generated = (response as unknown as { generatedImages?: Array<{ image?: { imageBytes?: string; mimeType?: string } }> })
    .generatedImages;
  const generatedData = generated?.[0]?.image?.imageBytes?.trim();
  if (generatedData) {
    const mimeType = generated?.[0]?.image?.mimeType?.trim() || "image/png";
    return { data: generatedData, mimeType };
  }

  for (const candidate of response.candidates ?? []) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts as Part[]) {
      const data = part.inlineData?.data?.trim();
      if (!data) continue;
      const mimeType = part.inlineData?.mimeType?.trim() || "image/png";
      return { data, mimeType };
    }
  }

  const mergedData = response.data?.trim();
  if (mergedData) {
    return { data: mergedData, mimeType: "image/png" };
  }

  return null;
}

export async function generateClubAiImageViaGemini(
  params: GenerateClubAiImageViaGeminiParams,
): Promise<GenerateClubAiImageViaGeminiResult> {
  const requestedModel = params.model?.trim() || ENV.clubAiPostImageModel || DEFAULT_IMAGE_MODEL;
  const normalizedRequestedModel = requestedModel.toLowerCase();

  if (!ENV.clubAiPostImageEnabled) {
    return {
      provider: "gemini",
      model: requestedModel,
      error: "CLUB_AI_POST_IMAGE_ENABLED is false",
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      provider: "gemini",
      model: requestedModel,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  const modelCandidates = [
    requestedModel,
    ...(LEGACY_NANO_BANANA_ALIASES.has(normalizedRequestedModel) ? IMAGE_MODEL_FALLBACKS : []),
    ...IMAGE_MODEL_FALLBACKS,
  ].filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

  const ai = new GoogleGenAI({ apiKey });
  let lastError = "Unknown image generation failure";

  for (const model of modelCandidates) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const inlineData = extractInlineData(response);
      if (!inlineData?.data) {
        lastError = "Model response did not include inline image data";
        continue;
      }

      const mimeType = normalizeMimeType(inlineData.mimeType || "image/png");
      const fileSlug = sanitizeSlug(params.prompt);
      const rawBuffer = Buffer.from(inlineData.data, "base64");
      const optimized = await optimizeImageBuffer(rawBuffer, mimeType);

      // Prefer ImageKit for generated images when configured.
      const imageKitResult = await uploadToImageKit({
        clubId: params.clubId,
        fileSlug,
        buffer: optimized.buffer,
        mimeType: optimized.mimeType,
      });

      let imageUrl = imageKitResult.imageUrl?.trim() ?? "";
      if (!imageUrl && imageKitResult.error) {
        log.warn("[club_ai] imagekit upload failed, fallback to cloudinary", {
          event: "club_ai:image_upload_imagekit_failed",
          clubId: params.clubId,
          model,
          message: imageKitResult.error,
        });
      }

      if (!imageUrl) {
        const cloudinaryResult = await uploadToCloudinary({
          clubId: params.clubId,
          fileSlug,
          buffer: optimized.buffer,
          mimeType: optimized.mimeType,
        });
        imageUrl = cloudinaryResult.imageUrl?.trim() ?? "";
        if (!imageUrl) {
          if (cloudinaryResult.error) {
            log.warn("[club_ai] cloudinary upload failed", {
              event: "club_ai:image_upload_cloudinary_failed",
              clubId: params.clubId,
              model,
              message: cloudinaryResult.error,
            });
          }
          return {
            provider: "gemini",
            model,
            error: cloudinaryResult.error ?? imageKitResult.error ?? "Image upload failed",
          };
        }
      }

      if (model !== requestedModel) {
        log.warn("[club_ai] requested image model unavailable, fallback model used", {
          event: "club_ai:image_model_fallback_used",
          clubId: params.clubId,
          requestedModel,
          usedModel: model,
        });
      }

      return {
        provider: "gemini",
        model,
        imageUrl,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      log.warn("[club_ai] image generation failed", {
        event: "club_ai:image_generation_failed",
        clubId: params.clubId,
        model,
        message: lastError,
      });
      // Keep trying fallback models.
    }
  }

  return {
    provider: "gemini",
    model: requestedModel,
    error: lastError,
  };
}
