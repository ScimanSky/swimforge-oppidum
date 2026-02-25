import { fetchWithTimeout } from "./lib/fetchWithTimeout";
import { logger } from "./middleware/logger";

const OPPIDUM_USER_AGENT = "SwimForgeBot/1.0 (+https://swimforge-frontend.onrender.com)";

export type OppidumParseError = {
  stage: string;
  url: string;
  message: string;
};

export type OppidumIndexAthleteLink = {
  athleteName: string;
  athleteSlug: string;
  athleteUrl: string;
};

export type OppidumIndexMeetLink = {
  meetName: string;
  meetSlug: string;
  meetUrl: string;
  meetDate: Date | null;
  meetDateRaw: string;
  seasonLabel: string | null;
};

export type OppidumIndexPayload = {
  rootUrl: string;
  athletes: OppidumIndexAthleteLink[];
  meets: OppidumIndexMeetLink[];
};

export type OppidumAthleteResultRow = {
  seasonLabel: string | null;
  meetName: string;
  meetDate: Date | null;
  meetDateRaw: string;
  eventLabel: string;
  finalTimeRaw: string | null;
  finalTimeCs: number | null;
  notes: string | null;
};

export type OppidumAthletePagePayload = {
  athleteName: string;
  athleteSlug: string;
  athleteUrl: string;
  rows: OppidumAthleteResultRow[];
};

export type OppidumMeetResultRow = {
  athleteName: string;
  eventLabel: string;
  finalTimeRaw: string | null;
  finalTimeCs: number | null;
  points: number | null;
  recordRaw: string | null;
  notes: string | null;
};

export type OppidumMeetPagePayload = {
  meetName: string;
  meetSlug: string;
  meetUrl: string;
  meetDate: Date | null;
  seasonLabel: string | null;
  rows: OppidumMeetResultRow[];
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

function getPathSlug(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const base = parts[parts.length - 1] ?? "";
    const withoutExt = base.replace(/\.html?$/i, "").trim();
    if (!withoutExt) return slugify(url);
    return slugify(withoutExt);
  } catch {
    return slugify(url);
  }
}

export function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function slugify(value: string): string {
  return normalizeTextKey(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function cleanMeasurement(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/-\s*new\s*-/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (/^[-–—]+$/.test(cleaned)) return null;
  if (/^(n\/?d|n\.?a\.?)$/i.test(cleaned)) return null;
  return cleaned;
}

function extractNotes(parts: Array<string | null | undefined>): string | null {
  const notes = parts
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .map((part) => String(part))
    .map((part) => {
      const raw = part.trim();
      if (/-\s*new\s*-/i.test(raw)) return "new";
      if (/nota/i.test(raw)) return "nota";
      return "";
    })
    .filter(Boolean);

  if (notes.length === 0) return null;
  return Array.from(new Set(notes)).join(", ");
}

function parseOppidumDateWords(raw: string): Date | null {
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

  const match = raw.trim().toLowerCase().match(/^(\d{1,2})\s+([a-zàèéìòù]+)\s+(\d{4})$/i);
  if (!match) return null;
  const day = Number(match[1]);
  const month = monthMap[normalizeTextKey(match[2])];
  const year = Number(match[3]);
  if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

export function parseOppidumDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]) - 1;
    const year = Number(slash[3]);
    if (Number.isInteger(day) && Number.isInteger(month) && Number.isInteger(year)) {
      return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
    }
  }

  return parseOppidumDateWords(value);
}

export function deriveSeasonLabelFromDate(date: Date | null): string | null {
  if (!date) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function normalizeSeasonLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const season = value.match(/^(\d{4})\s*[-/]\s*(\d{4})$/);
  if (!season) return null;
  return `${season[1]}-${season[2]}`;
}

export function parseOppidumPoints(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const normalized = raw.trim().replace(/\s+/g, "").replace(/,/g, ".");
  if (!normalized || normalized === "-") return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOppidumSwimTimeToCentiseconds(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = cleanMeasurement(raw)?.toLowerCase() ?? "";
  if (!cleaned || cleaned === "-" || /nota|dns|dnf|dq|squal/i.test(cleaned)) {
    return null;
  }

  const normalized = cleaned.replace(/\s+/g, "");

  const minuteWithQuote = normalized.match(/^(\d+)'(\d{1,2})"(\d{1,2})$/);
  if (minuteWithQuote) {
    const minutes = Number(minuteWithQuote[1]);
    const seconds = Number(minuteWithQuote[2]);
    const cs = Number(minuteWithQuote[3].padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const minuteDoubleQuoteTypo = normalized.match(/^(\d+)'(\d{1,2})'(\d{1,2})$/);
  if (minuteDoubleQuoteTypo) {
    const minutes = Number(minuteDoubleQuoteTypo[1]);
    const seconds = Number(minuteDoubleQuoteTypo[2]);
    const cs = Number(minuteDoubleQuoteTypo[3].padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const secondsWithQuote = normalized.match(/^(\d{1,3})"(\d{1,2})$/);
  if (secondsWithQuote) {
    const seconds = Number(secondsWithQuote[1]);
    const cs = Number(secondsWithQuote[2].padEnd(2, "0"));
    if (Number.isFinite(seconds) && Number.isFinite(cs)) {
      return seconds * 100 + cs;
    }
  }

  const colon = normalized.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,2}))?$/);
  if (colon) {
    const minutes = Number(colon[1]);
    const seconds = Number(colon[2]);
    const cs = Number((colon[3] ?? "0").padEnd(2, "0"));
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && Number.isFinite(cs)) {
      return (minutes * 60 + seconds) * 100 + cs;
    }
  }

  const dot = normalized.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (dot) {
    const seconds = Number(dot[1]);
    const cs = Number((dot[2] ?? "0").padEnd(2, "0"));
    if (Number.isFinite(seconds) && Number.isFinite(cs)) {
      return seconds * 100 + cs;
    }
  }

  return null;
}

function extractAnchors(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const anchorRe = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const anchorMatches = Array.from(html.matchAll(anchorRe)) as RegExpMatchArray[];
  for (const match of anchorMatches) {
    const href = (match[1] ?? "").trim();
    const text = stripHtml(match[2] ?? "");
    if (!href) continue;
    out.push({ href, text });
  }
  return out;
}

export function parseOppidumIndexHtml(html: string, rootUrl: string): OppidumIndexPayload {
  const meetBySlug = new Map<string, OppidumIndexMeetLink>();
  const meetingRe =
    /<p[^>]*>\s*([^<]*\d{4}[^<]*)\s*<\/p>[\s\S]*?<p[^>]*>\s*([^<]+)\s*<\/p>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>\s*Risultati\s*<\/a>/gi;

  const meetingMatches = Array.from(html.matchAll(meetingRe)) as RegExpMatchArray[];
  for (const match of meetingMatches) {
    const dateRaw = stripHtml(match[1] ?? "");
    const meetName = stripHtml(match[2] ?? "");
    const meetHref = (match[3] ?? "").trim();
    const meetUrl = normalizeUrl(rootUrl, meetHref);
    if (!meetUrl || !meetName) continue;
    const meetSlug = getPathSlug(meetUrl);
    if (!meetSlug) continue;

    const meetDate = parseOppidumDate(dateRaw);
    const seasonLabel = deriveSeasonLabelFromDate(meetDate);

    meetBySlug.set(meetSlug, {
      meetName,
      meetSlug,
      meetUrl,
      meetDate,
      meetDateRaw: dateRaw,
      seasonLabel,
    });
  }

  const athleteBySlug = new Map<string, OppidumIndexAthleteLink>();
  const anchors = extractAnchors(html);

  for (const anchor of anchors) {
    const hrefLower = anchor.href.toLowerCase();
    if (hrefLower.startsWith("javascript:")) continue;
    if (hrefLower.includes("/video/")) continue;
    if (hrefLower.includes("w3schools.com")) continue;

    const absolute = normalizeUrl(rootUrl, anchor.href);
    if (!absolute) continue;
    const parsedSlug = getPathSlug(absolute);
    if (!parsedSlug) continue;

    if (/^\d{4}-/.test(parsedSlug)) continue;
    if (["master", "index", "home", "w3", "w3-css"].some((token) => parsedSlug.includes(token))) continue;

    const athleteName = anchor.text.trim();
    if (!athleteName || /^risultati$/i.test(athleteName)) continue;

    athleteBySlug.set(parsedSlug, {
      athleteName,
      athleteSlug: parsedSlug,
      athleteUrl: absolute,
    });
  }

  return {
    rootUrl,
    athletes: Array.from(athleteBySlug.values()).sort((a, b) => a.athleteName.localeCompare(b.athleteName, "it")),
    meets: Array.from(meetBySlug.values()).sort((a, b) => {
      if (a.meetDate && b.meetDate) return b.meetDate.getTime() - a.meetDate.getTime();
      return a.meetName.localeCompare(b.meetName, "it");
    }),
  };
}

function findSeasonLabelForOffset(seasonHeadings: Array<{ index: number; label: string }>, offset: number): string | null {
  let found: string | null = null;
  for (const heading of seasonHeadings) {
    if (heading.index <= offset) {
      found = heading.label;
      continue;
    }
    break;
  }
  return found;
}

export function parseOppidumAthleteHtml(html: string, athleteUrl: string): OppidumAthletePagePayload {
  const headingMatch = html.match(/<h1[^>]*class=["'][^"']*w3-xlarge[^"']*["'][^>]*>\s*<b>\s*([^<]+)\s*<\/b>/i);
  const athleteName = stripHtml(headingMatch?.[1] ?? "") || getPathSlug(athleteUrl).replace(/-/g, " ");

  const seasonHeadings = Array.from(html.matchAll(/<h1[^>]*class=["'][^"']*w3-xlarge\s+w3-text-red[^"']*["'][^>]*>\s*<b>\s*([^<]+)\s*<\/b>/gi))
    .map((match) => ({
      index: match.index ?? 0,
      label: normalizeSeasonLabel(stripHtml(match[1] ?? "")) ?? "",
    }))
    .filter((item) => Boolean(item.label));

  const rows: OppidumAthleteResultRow[] = [];
  const manifestRe = /<div class=["'][^"']*w3-container[^"']*["'][^>]*>\s*<div class=["'][^"']*w3-half[^"']*["'][^>]*>[\s\S]*?<p[^>]*class=["'][^"']*w3-red[^"']*["'][^>]*>([^<]+)<\/p>[\s\S]*?<\/div>\s*<div class=["'][^"']*w3-half[^"']*["'][^>]*>[\s\S]*?<p[^>]*class=["'][^"']*w3-red[^"']*["'][^>]*>([^<]+)<\/p>[\s\S]*?<\/div>\s*<\/div>\s*<!--[\s]*Inizio Gare[\s]*-->\s*<div class=["'][^"']*w3-container[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<!--[\s]*Fine Gare[\s]*-->/gi;

  const manifestMatches = Array.from(html.matchAll(manifestRe)) as RegExpMatchArray[];
  for (const match of manifestMatches) {
    const offset = match.index ?? 0;
    const meetDateRaw = stripHtml(match[1] ?? "");
    const meetName = stripHtml(match[2] ?? "");
    const eventsHtml = match[3] ?? "";
    const seasonLabel = findSeasonLabelForOffset(seasonHeadings, offset);
    const meetDate = parseOppidumDate(meetDateRaw);

    const eventPairRe = /<li[^>]*>\s*<b>\s*([^<]+)\s*<\/b>\s*<\/li>\s*<li[^>]*>\s*([^<]*)\s*<\/li>/gi;
    const eventPairs = Array.from(eventsHtml.matchAll(eventPairRe)) as RegExpMatchArray[];

    for (const pair of eventPairs) {
      const eventLabel = stripHtml(pair[1] ?? "");
      if (!eventLabel) continue;
      const rawTime = cleanMeasurement(stripHtml(pair[2] ?? ""));
      const notes = extractNotes([pair[2]]);
      rows.push({
        seasonLabel,
        meetName,
        meetDate,
        meetDateRaw,
        eventLabel,
        finalTimeRaw: rawTime,
        finalTimeCs: parseOppidumSwimTimeToCentiseconds(rawTime),
        notes,
      });
    }
  }

  return {
    athleteName,
    athleteSlug: getPathSlug(athleteUrl),
    athleteUrl,
    rows,
  };
}

function parseMeetHeader(rawHeader: string): { meetName: string; meetDate: Date | null } {
  const normalized = stripHtml(rawHeader);
  const datePrefix = normalized.match(/^(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})\s+(.+)$/i);
  if (datePrefix) {
    const meetDate = parseOppidumDate(datePrefix[1]);
    const meetName = datePrefix[2].trim();
    return { meetName: meetName || normalized, meetDate };
  }

  const slashPrefix = normalized.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/i);
  if (slashPrefix) {
    const meetDate = parseOppidumDate(slashPrefix[1]);
    const meetName = slashPrefix[2].trim();
    return { meetName: meetName || normalized, meetDate };
  }

  return { meetName: normalized, meetDate: null };
}

export function parseOppidumMeetHtml(html: string, meetUrl: string): OppidumMeetPagePayload {
  const headerMatch = html.match(/<h1[^>]*class=["'][^"']*w3-xlarge\s+w3-text-red[^"']*["'][^>]*>\s*<b>\s*([^<]+)\s*<\/b>/i);
  const { meetName, meetDate } = parseMeetHeader(headerMatch?.[1] ?? "");
  const seasonLabel = deriveSeasonLabelFromDate(meetDate);

  const rows: OppidumMeetResultRow[] = [];
  const athleteBlockMatches = Array.from(html.matchAll(/<!--[\s]*Inizio Atleta[\s]*-->([\s\S]*?)<!--[\s]*Fine Atleta[\s]*-->/gi));

  for (const blockMatch of athleteBlockMatches) {
    const block = blockMatch[1] ?? "";
    const ulMatches = Array.from(block.matchAll(/<ul[^>]*class=["'][^"']*w3-ul[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi));
    if (ulMatches.length < 2) continue;

    const lists = ulMatches.map((ul) =>
      Array.from((ul[1] ?? "").matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((li) => stripHtml(li[1] ?? "")),
    );

    const firstList = lists[0] ?? [];
    const athleteName = firstList[0]?.trim() ?? "";
    if (!athleteName) continue;

    const eventLabels = firstList.slice(1).map((v) => v.trim());
    const times = (lists[1] ?? []).slice(1).map((v) => v.trim());
    const points = (lists[2] ?? []).slice(1).map((v) => v.trim());
    const records = (lists[3] ?? []).slice(1).map((v) => v.trim());

    const maxLen = Math.max(eventLabels.length, times.length, points.length, records.length);
    for (let i = 0; i < maxLen; i += 1) {
      const eventLabel = eventLabels[i]?.trim();
      if (!eventLabel) continue;

      const finalTimeRaw = cleanMeasurement(times[i]);
      const pointsValue = parseOppidumPoints(points[i]);
      const recordRaw = cleanMeasurement(records[i]);
      const notes = extractNotes([times[i], records[i]]);

      if (!finalTimeRaw && pointsValue === null && !recordRaw && !notes) continue;

      rows.push({
        athleteName,
        eventLabel,
        finalTimeRaw,
        finalTimeCs: parseOppidumSwimTimeToCentiseconds(finalTimeRaw),
        points: pointsValue,
        recordRaw,
        notes,
      });
    }
  }

  return {
    meetName: meetName || getPathSlug(meetUrl).replace(/-/g, " "),
    meetSlug: getPathSlug(meetUrl),
    meetUrl,
    meetDate,
    seasonLabel,
    rows,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtmlWithRetry(url: string, context: string, maxAttempts = 2): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent": OPPIDUM_USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        },
        12000,
        context,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("[club_history:oppidum] fetch attempt failed", {
        event: "club_history:oppidum_fetch_retry",
        url,
        context,
        attempt,
        maxAttempts,
        message: lastError.message,
      });

      if (attempt < maxAttempts) {
        await sleep(350 * attempt);
      }
    }
  }

  throw lastError ?? new Error("Unable to fetch source page");
}

export async function fetchAndParseOppidumIndex(rootUrl: string): Promise<OppidumIndexPayload> {
  const html = await fetchHtmlWithRetry(rootUrl, "club_history:index");
  return parseOppidumIndexHtml(html, rootUrl);
}

export async function fetchAndParseOppidumAthletePage(athleteUrl: string): Promise<OppidumAthletePagePayload> {
  const html = await fetchHtmlWithRetry(athleteUrl, "club_history:athlete");
  return parseOppidumAthleteHtml(html, athleteUrl);
}

export async function fetchAndParseOppidumMeetPage(meetUrl: string): Promise<OppidumMeetPagePayload> {
  const html = await fetchHtmlWithRetry(meetUrl, "club_history:meet");
  return parseOppidumMeetHtml(html, meetUrl);
}
