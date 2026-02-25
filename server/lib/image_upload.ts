import { createHash, randomBytes } from "crypto";
import { ENV } from "../_core/env";
import { logger } from "../middleware/logger";

type UploadImageParams = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  folder: string;
  fileNamePrefix?: string;
  tags?: string[];
};

type UploadImageResult = {
  url: string;
  provider: "imagekit" | "cloudinary";
};

const log = logger.child({ component: "image_upload" });

function normalizeFolder(folder: string): { imageKitFolder: string; cloudinaryFolder: string } {
  const normalized = folder.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return {
    imageKitFolder: `/${normalized}`,
    cloudinaryFolder: normalized,
  };
}

function extensionFromMimeType(mimeType: UploadImageParams["mimeType"]): "jpg" | "png" | "webp" {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function toDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function slugify(value: string): string {
  const out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return out || "image";
}

function buildCloudinarySignature(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

async function uploadToImageKit(params: UploadImageParams): Promise<UploadImageResult> {
  if (!ENV.imagekitPrivateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY not configured");
  }

  const { imageKitFolder } = normalizeFolder(params.folder);
  const extension = extensionFromMimeType(params.mimeType);
  const prefix = slugify(params.fileNamePrefix ?? "image");
  const fileName = `${prefix}-${Date.now()}-${randomBytes(3).toString("hex")}.${extension}`;
  const authHeader = `Basic ${Buffer.from(`${ENV.imagekitPrivateKey}:`).toString("base64")}`;

  const formData = new FormData();
  formData.append("file", toDataUri(params.buffer, params.mimeType));
  formData.append("fileName", fileName);
  formData.append("folder", imageKitFolder);
  formData.append("useUniqueFileName", "false");
  if (params.tags?.length) {
    formData.append("tags", params.tags.join(","));
  }

  const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ImageKit upload failed (${res.status}): ${detail || res.statusText}`);
  }

  const payload = (await res.json()) as { url?: string };
  const url = payload.url?.trim() ?? "";
  if (!url) {
    throw new Error("ImageKit upload returned empty URL");
  }

  return { url, provider: "imagekit" };
}

async function uploadToCloudinary(params: UploadImageParams): Promise<UploadImageResult> {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    throw new Error("Cloudinary credentials not configured");
  }

  const { cloudinaryFolder } = normalizeFolder(params.folder);
  const extension = extensionFromMimeType(params.mimeType);
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${slugify(params.fileNamePrefix ?? "image")}-${randomBytes(4).toString("hex")}`;
  const signature = buildCloudinarySignature(
    {
      folder: cloudinaryFolder,
      public_id: publicId,
      timestamp,
    },
    ENV.cloudinaryApiSecret,
  );

  const formData = new FormData();
  formData.append("file", toDataUri(params.buffer, params.mimeType));
  formData.append("api_key", ENV.cloudinaryApiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", cloudinaryFolder);
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
    throw new Error(`Cloudinary upload failed (${res.status}): ${detail || res.statusText}`);
  }

  const payload = (await res.json()) as { secure_url?: string; url?: string };
  const url = payload.secure_url?.trim() || payload.url?.trim() || "";
  if (!url) {
    throw new Error("Cloudinary upload returned empty URL");
  }

  return { url, provider: "cloudinary" };
}

export async function uploadImageToMediaProviders(params: UploadImageParams): Promise<UploadImageResult> {
  const errors: string[] = [];

  try {
    return await uploadToImageKit(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    log.warn("[image_upload] imagekit failed, trying cloudinary", {
      event: "image_upload:imagekit_failed",
      message,
      folder: params.folder,
    });
  }

  try {
    return await uploadToCloudinary(params);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    log.warn("[image_upload] cloudinary failed", {
      event: "image_upload:cloudinary_failed",
      message,
      folder: params.folder,
    });
  }

  throw new Error(`Image upload failed on all providers: ${errors.join(" | ")}`);
}
