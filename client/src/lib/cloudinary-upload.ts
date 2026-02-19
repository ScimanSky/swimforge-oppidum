export type CloudinaryVideoAuth = {
  cloudName: string
  apiKey: string
  timestamp: number
  signature: string
  folder: string
}

type CloudinaryUploadResult = {
  secure_url?: string
  url?: string
  public_id?: string
  error?: {
    message?: string
  }
}

export async function uploadVideoToCloudinary(
  file: File,
  auth: CloudinaryVideoAuth
) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("api_key", auth.apiKey)
  formData.append("timestamp", String(auth.timestamp))
  formData.append("signature", auth.signature)
  formData.append("folder", auth.folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${auth.cloudName}/video/upload`, {
    method: "POST",
    body: formData,
  })

  let payload: CloudinaryUploadResult | null = null
  try {
    payload = (await response.json()) as CloudinaryUploadResult
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload?.error?.message || `Cloudinary upload failed (${response.status})`
    throw new Error(detail)
  }

  const url = payload?.secure_url || payload?.url
  if (!url) {
    throw new Error("Cloudinary non ha restituito un URL valido")
  }

  return {
    url,
    publicId: payload?.public_id ?? null,
  }
}
