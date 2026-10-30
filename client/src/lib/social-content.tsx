import { Fragment, type ReactNode, useEffect, useState } from "react";
import { Link } from "wouter";
import { findMentions } from "@shared/mentions";
import { apiUrl } from "@/lib/api-base";
import { authenticatedApiInit } from "@/lib/api-auth";
import { isNativePlatform } from "@/lib/platform";
import { cn } from "@/lib/utils";

const CONTENT_TOKEN_SPLIT = /(\s+)/g;
const DOMAIN_LIKE_PATTERN = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>"']*)?$/i;
const INVISIBLE_CHARS_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/g;

function stripInvisibleChars(value: string) {
  return value.replace(INVISIBLE_CHARS_PATTERN, "");
}

function trimUrlTrailingPunctuation(value: string) {
  return value.replace(/[),.;!?]+$/g, "");
}

function trimUrlLeadingPunctuation(value: string) {
  return value.replace(/^[([{"']+/g, "");
}

function isSafeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function toNormalizedUrl(rawToken: string) {
  const cleanedRaw = stripInvisibleChars(rawToken);
  const strippedLeading = trimUrlLeadingPunctuation(cleanedRaw.trim());
  const cleanedToken = trimUrlTrailingPunctuation(strippedLeading);
  if (!cleanedToken) return null;

  const candidate = /^https?:\/\//i.test(cleanedToken)
    ? cleanedToken
    : DOMAIN_LIKE_PATTERN.test(cleanedToken)
      ? `https://${cleanedToken}`
      : null;
  if (!candidate) return null;
  if (!isSafeHttpUrl(candidate)) return null;
  return {
    href: candidate,
    display: cleanedToken,
  };
}

export function extractUrls(value: string) {
  const unique = new Set<string>();
  for (const token of stripInvisibleChars(value).split(/\s+/g)) {
    const normalized = toNormalizedUrl(token);
    if (!normalized) continue;
    unique.add(normalized.href);
  }
  return Array.from(unique.values());
}

export function extractFirstUrl(value: string) {
  return extractUrls(value)[0] ?? null;
}

/** Mentions and links in the action colour (Corsia: one accent). */
const DEFAULT_CLASSES = {
  mention: "font-medium text-action-text hover:underline",
  link: "font-medium text-action-text underline decoration-dotted underline-offset-2 hover:opacity-85",
} as const;

/** A user mentioned in the post, as stored (`tagged_users` of the feed). */
export type SocialTextMention = { user_id: number; name?: string | null; username?: string | null };

type SocialTextRenderOptions = {
  /** The post's mentioned users: their `@username`/`@name` link to their profile, by id. */
  mentions?: SocialTextMention[] | null;
  mentionClassName?: string;
  linkClassName?: string;
};

/** Plain text with its web addresses as links. */
function renderLinks(content: string, keyPrefix: string, linkClassName?: string): ReactNode[] {
  const parts = content.split(CONTENT_TOKEN_SPLIT);
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (/^\s+$/.test(part)) {
      return <span key={key}>{part}</span>;
    }

    const leading = part.match(/^[([{"']+/)?.[0] ?? "";
    const trailing = part.match(/[),.;!?]+$/)?.[0] ?? "";
    const normalized = toNormalizedUrl(part);
    if (normalized) {
      return (
        <Fragment key={key}>
          {leading}
          <a href={normalized.href} target="_blank" rel="noreferrer" className={linkClassName ?? DEFAULT_CLASSES.link}>
            {normalized.display}
          </a>
          {trailing}
        </Fragment>
      );
    }

    return <span key={key}>{part}</span>;
  });
}

/**
 * Post text: the mentions of the post's stored users link to their profile (an «@» of anyone
 * else stays plain text), web addresses are links, hashtags are plain text.
 */
export function renderSocialText(content: string, options?: SocialTextRenderOptions): ReactNode[] {
  const candidates = (options?.mentions ?? [])
    .map((user) => ({ id: Number(user.user_id), name: user.name ?? null, username: user.username ?? null }))
    .filter((user) => Number.isInteger(user.id) && user.id > 0);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of findMentions(content, candidates)) {
    if (match.start > cursor) {
      nodes.push(...renderLinks(content.slice(cursor, match.start), `text-${cursor}`, options?.linkClassName));
    }
    nodes.push(
      <Link
        key={`mention-${match.start}`}
        href={`/u/${match.id}`}
        className={options?.mentionClassName ?? DEFAULT_CLASSES.mention}
      >
        {content.slice(match.start, match.end)}
      </Link>
    );
    cursor = match.end;
  }
  if (cursor < content.length) {
    nodes.push(...renderLinks(content.slice(cursor), `text-${cursor}`, options?.linkClassName));
  }
  return nodes;
}

type ParsedLinkPreview = {
  href: string;
  host: string;
  label: string;
  pathLabel: string;
};

type RemoteLinkPreview = {
  requestedUrl: string;
  resolvedUrl: string;
  host: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageProxyUrl: string | null;
};

const linkPreviewCache = new Map<string, RemoteLinkPreview | null>();

function parseRemoteLinkPreview(payload: unknown): RemoteLinkPreview | null {
  if (!payload || typeof payload !== "object") return null;
  const source = payload as Record<string, unknown>;
  const requestedUrl = typeof source.requestedUrl === "string" ? source.requestedUrl : null;
  const resolvedUrl = typeof source.resolvedUrl === "string" ? source.resolvedUrl : null;
  const host = typeof source.host === "string" ? source.host : null;
  if (!requestedUrl || !resolvedUrl || !host) return null;

  return {
    requestedUrl,
    resolvedUrl,
    host,
    siteName: typeof source.siteName === "string" ? source.siteName : null,
    title: typeof source.title === "string" ? source.title : null,
    description: typeof source.description === "string" ? source.description : null,
    imageUrl: typeof source.imageUrl === "string" ? source.imageUrl : null,
    imageProxyUrl: typeof source.imageProxyUrl === "string" ? source.imageProxyUrl : null,
  };
}

function parseLinkPreview(url: string): ParsedLinkPreview | null {
  if (!isSafeHttpUrl(url)) return null;
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.trim();
    const pathLabel = path.length > 0 && path !== "/" ? path : "Apri link";
    return {
      href: parsed.toString(),
      host: parsed.hostname,
      label: `${parsed.protocol.replace(":", "")}://${parsed.hostname}`,
      pathLabel: pathLabel.length > 96 ? `${pathLabel.slice(0, 95)}…` : pathLabel,
    };
  } catch {
    return null;
  }
}

/**
 * Native only: the image proxy needs the bearer token, which an <img> cannot send, so the
 * image is fetched with it and shown from a blob URL (revoked on change and unmount).
 */
function useAuthenticatedImage(path: string | null, enabled: boolean) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !path) {
      setSrc(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(apiUrl(path), authenticatedApiInit({ method: "GET", signal: controller.signal }))
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, enabled]);

  return src;
}

/**
 * Card for the first link of a post: site, title and description (from /api/link-preview when
 * the server can read them), else the bare address. Nothing for an unsafe or invalid URL.
 */
export function LinkPreviewCard({
  url,
  className,
  compact = false,
}: {
  url: string;
  className?: string;
  compact?: boolean;
}) {
  const preview = parseLinkPreview(url);
  const previewHref = preview?.href ?? null;
  // Keyed by URL: a new link never shows the previous link's title while its own loads.
  const [fetched, setFetched] = useState<{ href: string; data: RemoteLinkPreview | null } | null>(null);

  useEffect(() => {
    if (!previewHref) return;
    const cached = linkPreviewCache.get(previewHref);
    if (cached !== undefined) {
      setFetched({ href: previewHref, data: cached });
      return;
    }

    const controller = new AbortController();
    const settle = (data: RemoteLinkPreview | null) => {
      linkPreviewCache.set(previewHref, data);
      setFetched({ href: previewHref, data });
    };
    fetch(
      apiUrl(`/api/link-preview?url=${encodeURIComponent(previewHref)}`),
      authenticatedApiInit({ method: "GET", signal: controller.signal }),
    )
      .then(async (response) => {
        settle(response.ok ? parseRemoteLinkPreview(await response.json()) : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) settle(null);
      });

    return () => controller.abort();
  }, [previewHref]);

  const remotePreview = preview
    ? fetched?.href === preview.href
      ? fetched.data
      : (linkPreviewCache.get(preview.href) ?? null)
    : null;
  const isNative = isNativePlatform();
  const imageProxyPath = remotePreview?.imageProxyUrl ?? null;
  // Hooks before the early return: the image hook must run on every render.
  const nativeImageSrc = useAuthenticatedImage(imageProxyPath, isNative);
  if (!preview) return null;

  // Where the server says the link ends up, when that is still an http(s) address.
  const resolvedUrl = remotePreview?.resolvedUrl;
  const href = resolvedUrl && isSafeHttpUrl(resolvedUrl) ? resolvedUrl : preview.href;
  const title = remotePreview?.title ?? preview.pathLabel;
  const description = remotePreview?.description;
  const siteName = remotePreview?.siteName ?? preview.host;
  // The web loads the proxy straight from <img>: same origin, so the session cookie goes along.
  const imageSrc = imageProxyPath
    ? isNative
      ? nativeImageSrc
      : apiUrl(imageProxyPath)
    : remotePreview?.imageUrl;
  const initial = siteName.trim().slice(0, 1).toUpperCase() || preview.host.slice(0, 1).toUpperCase();

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("group block rounded-xl bg-raised p-3 transition-opacity hover:opacity-90", className)}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt={`Anteprima ${siteName}`}
          className="mb-2 h-36 w-full rounded-lg object-cover sm:h-44"
          loading="lazy"
        />
      ) : null}

      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-xs font-semibold text-muted-foreground"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{siteName}</p>
          <p className={cn("truncate font-medium text-foreground group-hover:underline", compact ? "text-xs" : "text-sm")}>
            {title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description || preview.label}</p>
        </div>
      </div>
    </a>
  );
}
