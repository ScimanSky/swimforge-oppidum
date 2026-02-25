import { createHash } from "crypto";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";
import { logger } from "./middleware/logger";

const NUOTO_SARDEGNA_USER_AGENT = "SwimForgeBot/1.0 (+https://swimforge-frontend.onrender.com)";

export type NuotoSardegnaMeetCandidate = {
  title: string;
  sourceUrl: string;
  sourceHash: string;
  eventDate: Date;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

export function parseItalianDate(raw: string): Date | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]) - 1;
    const year = Number(slashMatch[3]);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
    return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  }

  const monthMap: Record<string, number> = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };

  const wordsMatch = value.match(/^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i);
  if (wordsMatch) {
    const day = Number(wordsMatch[1]);
    const monthKey = wordsMatch[2]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const month = monthMap[monthKey];
    const year = Number(wordsMatch[3]);
    if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) return null;
    return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
  }

  return null;
}

export function extractDateCandidates(text: string): Date[] {
  const out: Date[] = [];

  const slashRe = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g;
  const slashMatches = Array.from(text.matchAll(slashRe));
  for (const match of slashMatches) {
    const parsed = parseItalianDate(match[1]);
    if (parsed) out.push(parsed);
  }

  const wordsRe = /\b(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})\b/g;
  const wordsMatches = Array.from(text.matchAll(wordsRe));
  for (const match of wordsMatches) {
    const parsed = parseItalianDate(match[1]);
    if (parsed) out.push(parsed);
  }

  // Date ranges like "15-16 marzo 2026" -> pick first day.
  const rangeRe = /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})\b/g;
  const rangeMatches = Array.from(text.matchAll(rangeRe));
  for (const match of rangeMatches) {
    const parsed = parseItalianDate(`${match[1]} ${match[3]} ${match[4]}`);
    if (parsed) out.push(parsed);
  }

  return out;
}

function sameUtcDate(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function uniqueDates(dates: Date[]): Date[] {
  const out: Date[] = [];
  for (const item of dates) {
    if (!out.some((candidate) => sameUtcDate(candidate, item))) {
      out.push(item);
    }
  }
  return out;
}

export function extractCategoryLinks(html: string, categoryUrl: string): string[] {
  const anchorRe = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = Array.from(html.matchAll(anchorRe));

  const categoryOrigin = new URL(categoryUrl).origin;
  const categoryPath = new URL(categoryUrl).pathname;
  const links: string[] = [];

  for (const match of matches) {
    const href = (match[1] ?? "").trim();
    if (!href || href.startsWith("javascript:")) continue;

    const absolute = normalizeUrl(categoryUrl, href);
    if (!absolute) continue;

    let parsed: URL;
    try {
      parsed = new URL(absolute);
    } catch {
      continue;
    }

    if (parsed.origin !== categoryOrigin) continue;
    if (parsed.pathname === categoryPath) continue;
    if (parsed.pathname.includes("/category/")) continue;
    if (!parsed.pathname.includes("/")) continue;

    const lowerPath = parsed.pathname.toLowerCase();
    if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".png") || lowerPath.endsWith(".webp") || lowerPath.endsWith(".pdf")) {
      continue;
    }

    links.push(parsed.toString());
  }

  return Array.from(new Set(links)).slice(0, 18);
}

async function fetchHtml(url: string, context: string): Promise<string> {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent": NUOTO_SARDEGNA_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
    15000,
    context,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  return response.text();
}

export function extractArticleTitle(html: string): string {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const parsed = stripHtml(h1Match[1] ?? "");
    if (parsed) return parsed;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const parsed = stripHtml(titleMatch[1] ?? "");
    if (parsed) return parsed;
  }

  return "Comunicato Master";
}

export function extractFutureDateFromArticle(html: string, title: string, now: Date): Date | null {
  const text = `${title}\n${stripHtml(html)}`;
  const candidates = uniqueDates(extractDateCandidates(text));
  if (candidates.length === 0) return null;

  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const futureCandidates = candidates
    .filter((candidate) => candidate.getTime() >= todayUtc.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  return futureCandidates[0] ?? null;
}

export async function fetchNuotoSardegnaFutureMeetCandidates(params: {
  categoryUrl: string;
  now?: Date;
}): Promise<NuotoSardegnaMeetCandidate[]> {
  const now = params.now ?? new Date();
  const categoryUrl = params.categoryUrl.trim();
  const categoryHtml = await fetchHtml(categoryUrl, "club_ai:scan_meets_category");
  const links = extractCategoryLinks(categoryHtml, categoryUrl);
  const out: NuotoSardegnaMeetCandidate[] = [];

  for (const sourceUrl of links) {
    try {
      const articleHtml = await fetchHtml(sourceUrl, "club_ai:scan_meets_article");
      const title = extractArticleTitle(articleHtml);
      const eventDate = extractFutureDateFromArticle(articleHtml, title, now);
      if (!eventDate) continue;

      const sourceHash = createHash("sha256").update(sourceUrl.toLowerCase()).digest("hex");
      out.push({
        title,
        sourceUrl,
        sourceHash,
        eventDate,
      });
    } catch (error) {
      logger.warn("[club_ai] failed to parse NuotoSardegna article", {
        event: "club_ai:scan_meets_article_error",
        sourceUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  out.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  return out;
}
