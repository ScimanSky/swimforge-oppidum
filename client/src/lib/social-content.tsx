import { Fragment, type ReactNode, useEffect, useState } from "react";

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

export function normalizeTagSearchQuery(value: string) {
  return stripInvisibleChars(value).trim().replace(/^@+/, "").replace(/\s+/g, " ");
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

type SocialTextRenderOptions = {
  hashtagClassName?: string;
  mentionClassName?: string;
  linkClassName?: string;
};

export function renderSocialText(content: string, options?: SocialTextRenderOptions): ReactNode[] {
  const parts = content.split(CONTENT_TOKEN_SPLIT);
  return parts.map((part, index) => {
    if (/^\s+$/.test(part)) {
      return <span key={`space-${index}`}>{part}</span>;
    }

    const leading = part.match(/^[([{"']+/)?.[0] ?? "";
    const trailing = part.match(/[),.;!?]+$/)?.[0] ?? "";
    const core = trimUrlTrailingPunctuation(trimUrlLeadingPunctuation(part));

    if (/^#[A-Za-z0-9_]{2,40}$/.test(core)) {
      return (
        <Fragment key={`hash-${core}-${index}`}>
          {leading}
          <span className={options?.hashtagClassName ?? "font-medium text-[var(--electric-cyan)]"}>{core}</span>
          {trailing}
        </Fragment>
      );
    }

    if (/^@[A-Za-z0-9_]{2,40}$/.test(core)) {
      return (
        <Fragment key={`mention-${core}-${index}`}>
          {leading}
          <span className={options?.mentionClassName ?? "font-medium text-[var(--electric-lime)]"}>{core}</span>
          {trailing}
        </Fragment>
      );
    }

    const normalized = toNormalizedUrl(part);
    if (normalized) {
      return (
        <Fragment key={`url-${normalized.href}-${index}`}>
          {leading}
          <a
            href={normalized.href}
            target="_blank"
            rel="noreferrer"
            className={
              options?.linkClassName ??
              "font-medium text-[var(--electric-cyan)] underline decoration-dotted underline-offset-2 hover:opacity-85"
            }
          >
            {normalized.display}
          </a>
          {trailing}
        </Fragment>
      );
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
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

export function LinkPreviewCard({
  url,
  className = "",
  compact = false,
}: {
  url: string;
  className?: string;
  compact?: boolean;
}) {
  const preview = parseLinkPreview(url);
  if (!preview) return null;
  const [remotePreview, setRemotePreview] = useState<RemoteLinkPreview | null>(() => linkPreviewCache.get(preview.href) ?? null);

  useEffect(() => {
    const cached = linkPreviewCache.get(preview.href);
    if (cached !== undefined) {
      setRemotePreview(cached);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/link-preview?url=${encodeURIComponent(preview.href)}`, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          linkPreviewCache.set(preview.href, null);
          setRemotePreview(null);
          return;
        }
        const data = parseRemoteLinkPreview(await response.json());
        linkPreviewCache.set(preview.href, data);
        setRemotePreview(data);
      })
      .catch(() => {
        linkPreviewCache.set(preview.href, null);
        setRemotePreview(null);
      });

    return () => controller.abort();
  }, [preview.href]);

  const href = remotePreview?.resolvedUrl ?? preview.href;
  const title = remotePreview?.title ?? preview.pathLabel;
  const description = remotePreview?.description;
  const siteName = remotePreview?.siteName ?? preview.host;
  const imageSrc = remotePreview?.imageProxyUrl ?? remotePreview?.imageUrl;
  const initial = siteName.trim().slice(0, 1).toUpperCase() || preview.host.slice(0, 1).toUpperCase();

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-xl border border-border/70 bg-card/35 p-3 transition-colors hover:bg-card/55 ${className}`}
    >
      {imageSrc ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-border/60 bg-black/20">
          <img
            src={imageSrc}
            alt={`Anteprima ${siteName}`}
            className="h-36 w-full object-cover sm:h-44"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-sm border border-border/70 bg-background/70 text-[10px] font-semibold uppercase text-muted-foreground ${compact ? "h-4 w-4" : "h-5 w-5"}`}
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className={`truncate ${compact ? "text-[11px]" : "text-xs"} text-muted-foreground`}>{siteName}</p>
          <p
            className={`truncate ${compact ? "text-xs" : "text-sm"} font-medium text-foreground/90 group-hover:text-foreground`}
          >
            {title}
          </p>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          {!description ? <p className="mt-0.5 text-xs text-muted-foreground">{preview.label}</p> : null}
        </div>
      </div>
    </a>
  );
}
