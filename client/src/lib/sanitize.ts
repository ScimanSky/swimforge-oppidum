import DOMPurify from "dompurify"

// Keep this in sync with server-side sanitization (server/lib/sanitize.ts).
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br"],
    ALLOWED_ATTR: [],
  })
}

