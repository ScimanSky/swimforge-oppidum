import { ENV } from "../_core/env";
import { logger } from "../middleware/logger";
import { fetchWithTimeout } from "./fetchWithTimeout";

const log = logger.child({ component: "imagekit" });

function getImageKitBasicAuthHeader(): string {
  if (!ENV.imagekitPrivateKey) {
    throw new Error("IMAGEKIT_PRIVATE_KEY not configured");
  }
  return `Basic ${Buffer.from(`${ENV.imagekitPrivateKey}:`).toString("base64")}`;
}

export async function deleteImageKitFileById(fileId: string): Promise<{ deleted: boolean; notFound: boolean }> {
  const trimmedFileId = fileId.trim();
  if (!trimmedFileId) {
    return { deleted: false, notFound: true };
  }

  const response = await fetchWithTimeout(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(trimmedFileId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: getImageKitBasicAuthHeader(),
      },
    },
    undefined,
    "imagekit:delete_file",
  );

  if (response.ok) {
    return { deleted: true, notFound: false };
  }

  if (response.status === 404) {
    // Idempotent cleanup: already gone is acceptable.
    return { deleted: false, notFound: true };
  }

  const detail = await response.text().catch(() => "");
  log.warn("[ImageKit] delete file failed", {
    event: "imagekit:delete_file_failed",
    fileId: trimmedFileId,
    status: response.status,
    detail: detail.slice(0, 400),
  });
  throw new Error(`ImageKit delete failed (${response.status})`);
}
