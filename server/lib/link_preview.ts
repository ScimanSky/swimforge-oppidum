import dns from "node:dns/promises";
import net from "node:net";
import { pinnedRequest, type PinnedResponse, type PinnedTarget } from "./pinned_http";
import { logger } from "../middleware/logger";

const log = logger.child({ component: "link_preview" });

/** Whole fetch budget: every redirect hop and the body included. */
export const LINK_PREVIEW_TIMEOUT_MS = 7_000;
export const LINK_PREVIEW_HTML_MAX_BYTES = 1024 * 1024;
export const LINK_PREVIEW_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const LINK_PREVIEW_MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set([80, 443]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const LINK_PREVIEW_USER_AGENT =
  "Mozilla/5.0 (compatible; SwimForgeLinkPreview/1.0; +https://swimforge.app)";

const DISALLOWED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];

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

/**
 * Addresses a preview must never reach: loopback, private, link-local (incl. the cloud
 * metadata endpoint 169.254.169.254), CGNAT, multicast, reserved, documentation and the
 * IPv6 transition prefixes that embed an IPv4 address. net.BlockList also matches the
 * IPv4-mapped IPv6 form (::ffff:127.0.0.1, ::ffff:7f00:1) against the IPv4 rules.
 */
const BLOCKED_ADDRESSES = (() => {
  const list = new net.BlockList();
  const ipv4: Array<[string, number]> = [
    ["0.0.0.0", 8], // "this" network, incl. the unspecified address
    ["10.0.0.0", 8],
    ["100.64.0.0", 10], // CGNAT
    ["127.0.0.0", 8],
    ["169.254.0.0", 16], // link-local, cloud metadata
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved, broadcast
  ];
  const ipv6: Array<[string, number]> = [
    ["::", 96], // unspecified (::), loopback (::1), IPv4-compatible
    ["64:ff9b::", 96], // NAT64
    ["64:ff9b:1::", 48], // local-use NAT64
    ["100::", 64], // discard
    ["2001::", 32], // Teredo
    ["2001:db8::", 32], // documentation
    ["2002::", 16], // 6to4
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["fec0::", 10], // site-local (deprecated)
    ["ff00::", 8], // multicast
  ];
  for (const [network, prefix] of ipv4) list.addSubnet(network, prefix, "ipv4");
  for (const [network, prefix] of ipv6) list.addSubnet(network, prefix, "ipv6");
  return list;
})();

export function isDisallowedIp(address: string) {
  const family = net.isIP(address);
  if (!family) return true;
  try {
    return BLOCKED_ADDRESSES.check(address, family === 4 ? "ipv4" : "ipv6");
  } catch {
    return true;
  }
}

function hostNotAllowed() {
  return new LinkPreviewInputError("Host non consentito per anteprima link.");
}

/**
 * Resolves `hostname` and returns the address to connect to. Every address DNS returns
 * must be public: a name that also points inside the network is refused as a whole.
 */
async function resolvePublicTarget(rawHostname: string): Promise<PinnedTarget> {
  // URL keeps IPv6 literals in brackets; a trailing dot is the same name.
  const hostname = rawHostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
  if (!hostname) {
    throw new LinkPreviewInputError("URL non valida.");
  }

  if (hostname === "localhost" || DISALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw hostNotAllowed();
  }

  const literalFamily = net.isIP(hostname);
  if (literalFamily) {
    if (isDisallowedIp(hostname)) throw hostNotAllowed();
    return { address: hostname, family: literalFamily === 6 ? 6 : 4 };
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new LinkPreviewInputError("Host non raggiungibile.");
  }
  if (!addresses.length) {
    throw new LinkPreviewInputError("Host non raggiungibile.");
  }
  if (addresses.some((entry) => isDisallowedIp(entry.address))) {
    throw hostNotAllowed();
  }
  // All of them are vetted; prefer IPv4, since the server may have no IPv6 route.
  const chosen = addresses.find((entry) => entry.family === 4) ?? addresses[0];
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

/** Scheme, credentials and port rules, checked on the first URL and on every redirect. */
function assertAllowedUrl(parsed: URL) {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LinkPreviewInputError("Sono consentiti solo link http/https.");
  }
  if (parsed.username || parsed.password) {
    throw new LinkPreviewInputError("URL non valida.");
  }
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) {
    throw new LinkPreviewInputError("Porta non consentita per anteprima link.");
  }
}

async function validateExternalUrl(rawUrl: string): Promise<{ url: URL; target: PinnedTarget }> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new LinkPreviewInputError("Inserisci un URL valido.");
  }

  // Bare domains get https://, but an explicit other scheme (ftp://, file://) is refused.
  const explicitScheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed);
  if (explicitScheme && !/^https?$/i.test(explicitScheme[1])) {
    throw new LinkPreviewInputError("Sono consentiti solo link http/https.");
  }
  const withProtocol = explicitScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new LinkPreviewInputError("URL non valida.");
  }

  assertAllowedUrl(parsed);
  parsed.hash = "";
  const target = await resolvePublicTarget(parsed.hostname);
  return { url: parsed, target };
}

export async function normalizeAndValidateExternalPreviewUrl(rawUrl: string) {
  const { url } = await validateExternalUrl(rawUrl);
  return url.toString();
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Runs `run` with a signal that aborts after LINK_PREVIEW_TIMEOUT_MS, redirects and body included. */
async function withDeadline<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Link preview timed out")), LINK_PREVIEW_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET with redirects handled here, not by the HTTP client: every hop is checked (scheme,
 * port, resolved addresses) before its connection is opened, and the socket goes to the
 * vetted address. At most LINK_PREVIEW_MAX_REDIRECTS redirects are followed.
 */
async function requestFollowingRedirects(
  first: { url: URL; target: PinnedTarget },
  accept: string,
  signal: AbortSignal,
): Promise<{ url: URL; response: PinnedResponse }> {
  let { url, target } = first;
  for (let redirects = 0; ; redirects += 1) {
    const response = await pinnedRequest(url, target, {
      headers: {
        "User-Agent": LINK_PREVIEW_USER_AGENT,
        Accept: accept,
        "Accept-Encoding": "identity",
      },
      signal,
    });
    if (!REDIRECT_STATUSES.has(response.status)) {
      return { url, response };
    }
    response.destroy();
    if (redirects >= LINK_PREVIEW_MAX_REDIRECTS) {
      throw new Error("Too many redirects");
    }
    const location = headerValue(response.headers.location);
    if (!location) {
      throw new Error("Redirect without location");
    }
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      throw new LinkPreviewInputError("URL non valida.");
    }
    assertAllowedUrl(next);
    next.hash = "";
    target = await resolvePublicTarget(next.hostname);
    url = next;
  }
}

async function readBodyWithLimit(response: PinnedResponse, maxBytes: number, signal: AbortSignal) {
  const declaredLength = Number(headerValue(response.headers["content-length"]));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    response.destroy();
    throw new Error("Response body too large");
  }

  const onAbort = () => response.destroy();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) {
        response.destroy();
        throw new Error("Response body too large");
      }
      chunks.push(bytes);
    }
    if (signal.aborted) {
      throw new Error("Link preview timed out");
    }
    return Buffer.concat(chunks, total);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function isSuccess(status: number) {
  return status >= 200 && status < 300;
}

export async function fetchLinkPreviewMetadata(rawUrl: string): Promise<LinkPreviewMetadata> {
  const first = await validateExternalUrl(rawUrl);
  const normalizedUrl = first.url.toString();
  const requested = first.url;

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
    return await withDeadline(async (signal) => {
      const { url: resolvedParsed, response } = await requestFollowingRedirects(
        first,
        "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        signal,
      );

      if (!isSuccess(response.status)) {
        response.destroy();
        return fallback;
      }

      const resolvedUrl = resolvedParsed.toString();
      const contentType = (headerValue(response.headers["content-type"]) ?? "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        response.destroy();
        return {
          ...fallback,
          resolvedUrl,
          host: resolvedParsed.hostname,
          siteName: resolvedParsed.hostname,
        };
      }

      const htmlBytes = await readBodyWithLimit(response, LINK_PREVIEW_HTML_MAX_BYTES, signal);
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
    });
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
  const first = await validateExternalUrl(rawUrl);

  return withDeadline(async (signal) => {
    const { response } = await requestFollowingRedirects(
      first,
      "image/avif,image/webp,image/apng,image/*;q=0.8",
      signal,
    );

    if (!isSuccess(response.status)) {
      response.destroy();
      throw new Error(`Image fetch failed with status ${response.status}`);
    }

    const contentTypeHeader = (headerValue(response.headers["content-type"]) ?? "").toLowerCase();
    const mimeType = contentTypeHeader.split(";")[0]?.trim() ?? "";
    // SVG can carry scripts and would be served from our origin: raster images only.
    if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
      response.destroy();
      throw new Error("Unsupported preview image content type");
    }

    const imageBytes = await readBodyWithLimit(response, LINK_PREVIEW_IMAGE_MAX_BYTES, signal);

    return {
      buffer: imageBytes,
      mimeType,
    };
  });
}

export function buildLinkPreviewImageProxyUrl(imageUrl: string) {
  return `/api/link-preview/image?url=${encodeURIComponent(imageUrl)}`;
}
