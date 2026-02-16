export type PostMediaKind = "image" | "video"

export const ACCEPTED_POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const ACCEPTED_POST_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"] as const
export const ACCEPTED_POST_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"] as const

export const MAX_POST_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_POST_VIDEO_BYTES = 100 * 1024 * 1024
export const MAX_POST_MEDIA_ITEMS = 4

const HASHTAG_REGEX = /(^|\s)#([A-Za-z0-9_]{2,40})/g
const VIDEO_URL_REGEX = /\.(mp4|mov|webm|m4v)(\?.*)?$/i

export function detectMediaKindFromFile(file: File): PostMediaKind | null {
  if (ACCEPTED_POST_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_POST_IMAGE_TYPES)[number])) {
    return "image"
  }

  const nameLower = file.name.toLowerCase()
  const hasVideoMime = ACCEPTED_POST_VIDEO_TYPES.includes(file.type as (typeof ACCEPTED_POST_VIDEO_TYPES)[number])
  const hasVideoExtension = ACCEPTED_POST_VIDEO_EXTENSIONS.some((ext) => nameLower.endsWith(ext))
  if (hasVideoMime || hasVideoExtension) {
    return "video"
  }

  return null
}

export function validatePostMediaFile(file: File): { ok: true; kind: PostMediaKind } | { ok: false; message: string } {
  const kind = detectMediaKindFromFile(file)
  if (!kind) {
    return { ok: false, message: "Formato non supportato. Usa JPG, PNG, WEBP, MP4, WEBM o MOV." }
  }

  if (kind === "image" && file.size > MAX_POST_IMAGE_BYTES) {
    return { ok: false, message: "Immagine troppo grande (max 20MB)." }
  }

  if (kind === "video" && file.size > MAX_POST_VIDEO_BYTES) {
    return { ok: false, message: "Video troppo grande (max 100MB)." }
  }

  return { ok: true, kind }
}

export function extractHashtags(content: string) {
  const tags = Array.from(content.matchAll(HASHTAG_REGEX))
    .map((entry) => (entry?.[2] ?? "").trim().toLowerCase())
    .filter((tag) => tag.length >= 2 && tag.length <= 40)
  return Array.from(new Set(tags))
}

export function isVideoUrl(url: string) {
  const cleaned = url.split("#")[0]
  return VIDEO_URL_REGEX.test(cleaned)
}
