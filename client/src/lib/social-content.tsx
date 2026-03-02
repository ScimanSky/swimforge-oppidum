import { Fragment, type ReactNode } from "react";

const URL_TOKEN_PATTERN = /^https?:\/\/[^\s<>"']+$/i;
const CONTENT_TOKEN_SPLIT = /(https?:\/\/[^\s<>"']+|#[A-Za-z0-9_]{2,40}|@[A-Za-z0-9_]{2,40})/g;

function trimUrlTrailingPunctuation(value: string) {
  return value.replace(/[),.;!?]+$/g, "");
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

export function extractUrls(value: string) {
  const matches = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    const cleaned = trimUrlTrailingPunctuation(match.trim());
    if (!cleaned) continue;
    if (!isSafeHttpUrl(cleaned)) continue;
    unique.add(cleaned);
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
    if (/^#[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`hash-${part}-${index}`} className={options?.hashtagClassName ?? "font-medium text-[var(--electric-cyan)]"}>
          {part}
        </span>
      );
    }

    if (/^@[A-Za-z0-9_]{2,40}$/.test(part)) {
      return (
        <span key={`mention-${part}-${index}`} className={options?.mentionClassName ?? "font-medium text-[var(--electric-lime)]"}>
          {part}
        </span>
      );
    }

    if (URL_TOKEN_PATTERN.test(part)) {
      const cleaned = trimUrlTrailingPunctuation(part);
      const suffix = part.slice(cleaned.length);
      if (cleaned && isSafeHttpUrl(cleaned)) {
        return (
          <Fragment key={`url-${cleaned}-${index}`}>
            <a
              href={cleaned}
              target="_blank"
              rel="noreferrer"
              className={
                options?.linkClassName ??
                "font-medium text-[var(--electric-cyan)] underline decoration-dotted underline-offset-2 hover:opacity-85"
              }
            >
              {cleaned}
            </a>
            {suffix}
          </Fragment>
        );
      }
    }

    return <span key={`text-${index}`}>{part}</span>;
  });
}

type ParsedLinkPreview = {
  href: string;
  host: string;
  label: string;
  pathLabel: string;
  faviconUrl: string;
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
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`,
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
        <img
          src={preview.faviconUrl}
          alt=""
          aria-hidden="true"
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} rounded-sm`}
          loading="lazy"
        />
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
