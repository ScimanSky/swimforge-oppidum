const env = import.meta.env as Record<string, string | boolean | undefined>

function parseBooleanFlag(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return fallback

  const normalized = value.trim().toLowerCase()
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false
  }

  return fallback
}

export const UI_FEATURE_FLAGS = Object.freeze({
  mockSections: parseBooleanFlag(env["VITE_UI_MOCK_SECTIONS"], Boolean(env["DEV"])),
  clubMeetsV1: parseBooleanFlag(env["VITE_CLUB_MEETS_V1_ENABLED"], false),
  clubHistoryV1: parseBooleanFlag(env["VITE_CLUB_HISTORY_V1_ENABLED"], false),
  clubAiAutomationV1: parseBooleanFlag(env["VITE_CLUB_AI_AUTOMATION_V1_ENABLED"], false),
})
