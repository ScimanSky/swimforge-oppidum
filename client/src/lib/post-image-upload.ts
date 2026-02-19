import { fileToBase64 } from "@/lib/file-base64"

export type ImageKitPostAuth = {
  publicKey: string
  token: string
  signature: string
  expire: number
  folder: string
}

type ImageKitErrorPayload = {
  message?: string
  help?: string
}

type ImageKitSuccessPayload = {
  url?: string
}

type UploadPostImageOptions = {
  file: File
  auth: ImageKitPostAuth
  uploadFallback: (payload: {
    fileBase64: string
    mimeType: "image/jpeg" | "image/png" | "image/webp"
  }) => Promise<{ url: string }>
  onFallbackUsed?: () => void
  fetchImpl?: typeof fetch
}

function buildImageKitFormData(file: File, auth: ImageKitPostAuth) {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const fileName = `post-${Date.now()}-${safeFileName}`

  const formData = new FormData()
  formData.append("file", file)
  formData.append("fileName", fileName)
  formData.append("publicKey", auth.publicKey)
  formData.append("token", auth.token)
  formData.append("signature", auth.signature)
  formData.append("expire", String(auth.expire))
  formData.append("folder", auth.folder)
  formData.append("useUniqueFileName", "true")
  formData.append("tags", "post,swimforge")

  return formData
}

export async function uploadPostImageWithFallback(options: UploadPostImageOptions) {
  const { file, auth, uploadFallback, onFallbackUsed, fetchImpl = fetch } = options

  try {
    const response = await fetchImpl("https://upload.imagekit.io/api/v1/files/upload", {
      method: "POST",
      body: buildImageKitFormData(file, auth),
    })

    if (!response.ok) {
      let detail = ""
      try {
        const payload = (await response.json()) as ImageKitErrorPayload
        detail = payload.message || payload.help || ""
      } catch {
        detail = await response.text().catch(() => "")
      }
      throw new Error(detail || "Upload media fallito")
    }

    const uploaded = (await response.json()) as ImageKitSuccessPayload
    if (!uploaded.url) {
      throw new Error("ImageKit non ha restituito un URL valido")
    }
    return uploaded.url
  } catch (imageKitError) {
    const fallbackPayload = await fileToBase64(file)
    try {
      const uploaded = await uploadFallback({
        fileBase64: fallbackPayload,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      })
      onFallbackUsed?.()
      return uploaded.url
    } catch (fallbackError) {
      const primaryMessage = imageKitError instanceof Error ? imageKitError.message : "Upload media fallito"
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "Upload media fallito"
      throw new Error(fallbackMessage || primaryMessage)
    }
  }
}
