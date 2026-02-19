export async function fileToBase64(file: File): Promise<string> {
  // Primary path: ArrayBuffer is generally more reliable on mobile browsers.
  try {
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ""
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...Array.from(chunk))
    }
    return btoa(binary)
  } catch {
    // Fallback path for browsers that fail on arrayBuffer for local file handles.
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== "string") {
          reject(new Error("Impossibile leggere il file"))
          return
        }
        const commaIdx = result.indexOf(",")
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
      }
      reader.onerror = () => reject(new Error("Impossibile leggere il file"))
      reader.readAsDataURL(file)
    })
  }
}
