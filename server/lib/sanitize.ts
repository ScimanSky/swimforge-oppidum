import sanitizeHtml from "sanitize-html";

// Shared sanitizer rules for user-provided rich text that may be rendered as HTML.
const ALLOWED_TAGS = ["b", "i", "em", "strong", "p", "br"];

export function sanitizeActivityNotes(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
}

