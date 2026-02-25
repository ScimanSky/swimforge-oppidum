import { GoogleGenAI, Modality, type GenerateContentResponse, type Part } from "@google/genai";
import { ENV } from "./_core/env";
import { getSupabaseAdminClient } from "./_core/supabase_admin";
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
const DEFAULT_IMAGE_MODEL = "nano-banana-pro";

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
  const model = params.model?.trim() || ENV.clubAiPostImageModel || DEFAULT_IMAGE_MODEL;

  if (!ENV.clubAiPostImageEnabled) {
    return {
      provider: "gemini",
      model,
      error: "CLUB_AI_POST_IMAGE_ENABLED is false",
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      provider: "gemini",
      model,
      error: "GEMINI_API_KEY is not configured",
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: params.prompt,
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const inlineData = extractInlineData(response);
    if (!inlineData?.data) {
      return {
        provider: "gemini",
        model,
        error: "Model response did not include inline image data",
      };
    }

    const mimeType = inlineData.mimeType || "image/png";
    const extension = extensionFromMimeType(mimeType);
    const fileSlug = sanitizeSlug(params.prompt);
    const filePath = `clubs/${params.clubId}/ai-posts/${Date.now()}-${fileSlug}.${extension}`;

    const buffer = Buffer.from(inlineData.data, "base64");
    const admin = getSupabaseAdminClient();
    const { error: uploadError } = await admin.storage.from("profile-media").upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });
    if (uploadError) {
      return {
        provider: "gemini",
        model,
        error: `Supabase upload failed: ${uploadError.message}`,
      };
    }

    const { data } = admin.storage.from("profile-media").getPublicUrl(filePath);
    const imageUrl = data.publicUrl?.trim();
    if (!imageUrl) {
      return {
        provider: "gemini",
        model,
        error: "Supabase public URL is empty",
      };
    }

    return {
      provider: "gemini",
      model,
      imageUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[club_ai] image generation failed", {
      event: "club_ai:image_generation_failed",
      clubId: params.clubId,
      model,
      message,
    });
    return {
      provider: "gemini",
      model,
      error: message,
    };
  }
}
