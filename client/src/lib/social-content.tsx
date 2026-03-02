import { Fragment, type ReactNode } from "react";

const CONTENT_TOKEN_SPLIT = /(\s+)/g;
const DOMAIN_LIKE_PATTERN = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>"']*)?$/i;

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
  return value.trim().replace(/^@+/, "").replace(/\s+/g, " ");
}

function toNormalizedUrl(rawToken: string) {
  const strippedLeading = trimUrlLeadingPunctuation(rawToken.trim());
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
  for (const token of value.split(/\s+/g)) {
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

  return (
    <a
      href={preview.href}
      target="_blank"
      rel="noreferrer"
      className={`group block rounded-xl border border-border/70 bg-card/35 p-3 transition-colors hover:bg-card/55 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-sm border border-border/70 bg-background/70 text-[10px] font-semibold uppercase text-muted-foreground ${compact ? "h-4 w-4" : "h-5 w-5"}`}
        >
          {preview.host.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className={`truncate ${compact ? "text-[11px]" : "text-xs"} text-muted-foreground`}>{preview.label}</p>
          <p className={`truncate ${compact ? "text-xs" : "text-sm"} font-medium text-foreground/90 group-hover:text-foreground`}>
            {preview.pathLabel}
          </p>
        </div>
      </div>
    </a>
  );
}
