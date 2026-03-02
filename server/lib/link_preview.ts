import dns from "node:dns/promises";
import net from "node:net";
import { fetchWithTimeout } from "./fetchWithTimeout";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "link_preview" });

const LINK_PREVIEW_TIMEOUT_MS = 7_000;
const LINK_PREVIEW_HTML_MAX_BYTES = 600 * 1024;
const LINK_PREVIEW_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
const LINK_PREVIEW_USER_AGENT =
  "Mozilla/5.0 (compatible; SwimForgeLinkPreview/1.0; +https://swimforge.app)";

const DISALLOWED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];

export class LinkPreviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LinkPreviewInputError";
  }
}

export type LinkPreviewMetadata = {
  requestedUrl: string;
  resolvedUrl: string;
  host: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
};

function toUtf8String(buffer: Uint8Array) {
  return new TextDecoder("utf-8").decode(buffer);
}

function decodeHtmlEntities(value: string) {
  const withNamed = value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");

  const withHex = withNamed.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
    const codePoint = Number.parseInt(hex, 16);
    if (!Number.isFinite(codePoint)) return "";
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return "";
    }
  });

  return withHex.replace(/&#(\d+);/g, (_, dec: string) => {
    const codePoint = Number.parseInt(dec, 10);
    if (!Number.isFinite(codePoint)) return "";
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return "";
    }
  });
}

function sanitizeText(value: string | null | undefined, maxLength: number) {
  if (!value) return null;
  const compact = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

function parseMetaTags(html: string) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const attrsByTag: Array<Record<string, string>> = [];
  const attrPattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

  for (const tag of metaTags) {
    const attrs: Record<string, string> = {};
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(tag)) !== null) {
      const key = match[1].toLowerCase();
      const raw = match[2] ?? match[3] ?? match[4] ?? "";
      attrs[key] = raw;
    }
    attrsByTag.push(attrs);
  }

  return attrsByTag;
}

function findMetaContent(
  attrsByTag: Array<Record<string, string>>,
  selectors: Array<{ attr: "name" | "property"; value: string }>,
) {
  for (const selector of selectors) {
    const wanted = selector.value.toLowerCase();
    for (const attrs of attrsByTag) {
      if ((attrs[selector.attr] ?? "").toLowerCase() !== wanted) continue;
      const content = sanitizeText(attrs.content, 280);
      if (content) return content;
    }
  }
  return null;
}

function findMetaImage(attrsByTag: Array<Record<string, string>>) {
  const candidates = [
    { attr: "property", value: "og:image:secure_url" },
    { attr: "property", value: "og:image" },
    { attr: "name", value: "twitter:image" },
    { attr: "name", value: "twitter:image:src" },
  ] as const;

  for (const selector of candidates) {
    const wanted = selector.value.toLowerCase();
    for (const attrs of attrsByTag) {
      if ((attrs[selector.attr] ?? "").toLowerCase() !== wanted) continue;
      const raw = attrs.content?.trim();
      if (!raw) continue;
      return raw;
    }
  }

  return null;
}

function findDocumentTitle(html: string) {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return sanitizeText(titleMatch?.[1] ?? null, 140);
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;

  return false;
}

function isPrivateIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  }

  return false;
}

function isDisallowedIp(address: string) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 4) return isPrivateIpv4(address);
  return isPrivateIpv6(address);
}

async function assertHostnameIsPublic(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    throw new LinkPreviewInputError("URL non valida.");
  }

  if (normalized === "localhost" || DISALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    throw new LinkPreviewInputError("Host non consentito per anteprima link.");
  }

  if (net.isIP(normalized) && isDisallowedIp(normalized)) {
    throw new LinkPreviewInputError("Host non consentito per anteprima link.");
  }

  if (!net.isIP(normalized)) {
    try {
      const addresses = await dns.lookup(normalized, { all: true, verbatim: true });
      if (!addresses.length) {
        throw new LinkPreviewInputError("Host non raggiungibile.");
      }
      if (addresses.some((entry) => isDisallowedIp(entry.address))) {
        throw new LinkPreviewInputError("Host non consentito per anteprima link.");
      }
    } catch (error) {
      if (error instanceof LinkPreviewInputError) {
        throw error;
      }
      throw new LinkPreviewInputError("Host non raggiungibile.");
    }
  }
}

export async function normalizeAndValidateExternalPreviewUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new LinkPreviewInputError("Inserisci un URL valido.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new LinkPreviewInputError("URL non valida.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LinkPreviewInputError("Sono consentiti solo link http/https.");
  }

  if (parsed.username || parsed.password) {
    throw new LinkPreviewInputError("URL non valida.");
  }

  parsed.hash = "";
  await assertHostnameIsPublic(parsed.hostname);

  return parsed.toString();
}

async function readBodyWithLimit(response: Response, maxBytes: number) {
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength && Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Response body too large");
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength > maxBytes) {
      throw new Error("Response body too large");
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error("Response body too large");
    }
    chunks.push(value);
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function fetchLinkPreviewMetadata(rawUrl: string): Promise<LinkPreviewMetadata> {
  const normalizedUrl = await normalizeAndValidateExternalPreviewUrl(rawUrl);
  const requested = new URL(normalizedUrl);

  const fallback: LinkPreviewMetadata = {
    requestedUrl: normalizedUrl,
    resolvedUrl: normalizedUrl,
    host: requested.hostname,
    siteName: requested.hostname,
    title: null,
    description: null,
    imageUrl: null,
  };

  try {
    const response = await fetchWithTimeout(
      normalizedUrl,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": LINK_PREVIEW_USER_AGENT,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      },
      LINK_PREVIEW_TIMEOUT_MS,
      "link_preview_metadata",
    );

    if (!response.ok) {
      return fallback;
    }

    const resolvedUrl = response.url || normalizedUrl;
    const resolvedParsed = new URL(resolvedUrl);
    await assertHostnameIsPublic(resolvedParsed.hostname);

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return {
        ...fallback,
        resolvedUrl,
        host: resolvedParsed.hostname,
        siteName: resolvedParsed.hostname,
      };
    }

    const htmlBytes = await readBodyWithLimit(response, LINK_PREVIEW_HTML_MAX_BYTES);
    const html = toUtf8String(htmlBytes);
    const attrsByTag = parseMetaTags(html);

    const title =
      findMetaContent(attrsByTag, [
        { attr: "property", value: "og:title" },
        { attr: "name", value: "twitter:title" },
      ]) ?? findDocumentTitle(html);

    const description = findMetaContent(attrsByTag, [
      { attr: "property", value: "og:description" },
      { attr: "name", value: "twitter:description" },
      { attr: "name", value: "description" },
    ]);

    const siteName =
      findMetaContent(attrsByTag, [{ attr: "property", value: "og:site_name" }]) ?? resolvedParsed.hostname;

    const rawImageUrl = findMetaImage(attrsByTag);
    let imageUrl: string | null = null;
    if (rawImageUrl) {
      try {
        const resolvedImageUrl = new URL(rawImageUrl, resolvedUrl);
        if (resolvedImageUrl.protocol === "http:" || resolvedImageUrl.protocol === "https:") {
          imageUrl = resolvedImageUrl.toString();
        }
      } catch {
        imageUrl = null;
      }
    }

    return {
      requestedUrl: normalizedUrl,
      resolvedUrl,
      host: resolvedParsed.hostname,
      siteName,
      title,
      description,
      imageUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("link preview metadata fallback", {
      event: "link_preview:metadata_fallback",
      url: normalizedUrl,
      message,
    });
    return fallback;
  }
}

export async function fetchLinkPreviewImage(rawUrl: string) {
  const normalizedUrl = await normalizeAndValidateExternalPreviewUrl(rawUrl);

  const response = await fetchWithTimeout(
    normalizedUrl,
    {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": LINK_PREVIEW_USER_AGENT,
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.7",
      },
    },
    LINK_PREVIEW_TIMEOUT_MS,
    "link_preview_image",
  );

  if (!response.ok) {
    throw new Error(`Image fetch failed with status ${response.status}`);
  }

  const resolvedUrl = response.url || normalizedUrl;
  const resolvedParsed = new URL(resolvedUrl);
  await assertHostnameIsPublic(resolvedParsed.hostname);

  const contentTypeHeader = (response.headers.get("content-type") ?? "").toLowerCase();
  const mimeType = contentTypeHeader.split(";")[0]?.trim();
  if (!mimeType || !mimeType.startsWith("image/")) {
    throw new Error("Unsupported preview image content type");
  }

  const imageBytes = await readBodyWithLimit(response, LINK_PREVIEW_IMAGE_MAX_BYTES);

  return {
    buffer: Buffer.from(imageBytes),
    mimeType,
  };
}

export function buildLinkPreviewImageProxyUrl(imageUrl: string) {
  return `/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`;
}
