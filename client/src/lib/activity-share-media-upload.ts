import { uploadVideoToCloudinary, type CloudinaryVideoAuth } from "@/lib/cloudinary-upload"
import { uploadPostImageWithFallback, type ImageKitPostAuth } from "@/lib/post-image-upload"
import type { PostMediaKind } from "@/lib/post-media"

type CloudinaryAuthWithWarning = CloudinaryVideoAuth & {
  warning?: string | null
}

type UploadActivityShareMediaParams = {
  file: File
  kind: PostMediaKind
  getImageKitAuth: () => Promise<ImageKitPostAuth>
  uploadImageFallback: (payload: {
    fileBase64: string
    mimeType: "image/jpeg" | "image/png" | "image/webp"
  }) => Promise<{ url: string }>
  getCloudinaryAuth: () => Promise<CloudinaryAuthWithWarning>
  notifyWarning?: (message: string) => void
}

export async function uploadActivityShareMedia(params: UploadActivityShareMediaParams) {
  const {
    file,
    kind,
    getImageKitAuth,
    uploadImageFallback,
    getCloudinaryAuth,
    notifyWarning,
  } = params

  if (kind === "video") {
    const auth = await getCloudinaryAuth()
    if (auth.warning) notifyWarning?.(auth.warning)
    const uploaded = await uploadVideoToCloudinary(file, auth)
    return uploaded.url
  }

  const auth = await getImageKitAuth()
  return uploadPostImageWithFallback({
    file,
    auth,
    uploadFallback: uploadImageFallback,
    onFallbackUsed: () => {
      notifyWarning?.("Upload diretto non riuscito: usato fallback server.")
    },
  })
}
