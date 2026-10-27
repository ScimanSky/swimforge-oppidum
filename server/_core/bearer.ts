type HeaderValue = string | string[] | undefined;

/** Reads a `Bearer <token>` Authorization header. Returns null when absent or malformed. */
export function extractBearerToken(headers: { authorization?: HeaderValue }): string | null {
  const raw = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  if (typeof raw !== "string") return null;
  const match = /^\s*bearer\s+(.+?)\s*$/i.exec(raw);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
