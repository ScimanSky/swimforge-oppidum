export type TabId = "today" | "feed" | "train" | "community";
export type HubId = "train" | "community";
export type SectionTab = {
  label: string;
  path: string;
  match: (path: string) => boolean;
  dataTour?: string;
};

export const TODAY_PATH = "/today";
export const FEED_PATH = "/home";

/** Path without query, hash and trailing slash ("/" stays "/"). */
export const normalizePath = (location: string) => {
  const path = location.split("?")[0].split("#")[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
};

/**
 * Public routes, rendered outside the persistent (signed-in) shell. App.tsx builds its public
 * <Route>s from this list; everything else goes to the shell.
 */
export const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/auth/callback",
  "/auth/consenso",
  "/strava/callback",
  "/login",
  "/register",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/cookies",
] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/** True for the public pages (and anything under /auth/), false for the shell pages. */
export function isPublicPath(location: string): boolean {
  const path = normalizePath(location);
  return (
    (PUBLIC_PATHS as readonly string[]).includes(path) ||
    path.startsWith("/auth/")
  );
}

const starts =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some(
      prefix => path === prefix || path.startsWith(`${prefix}/`)
    );

const isToday = starts(TODAY_PATH);
const isReport = starts("/home/report/post", "/report/post");
const isFeed = (path: string) =>
  path === FEED_PATH || starts("/post", "/home/report", "/report/post")(path);
const isTrain = starts(
  "/track",
  "/activities",
  "/goals",
  "/profile/performance",
  "/statistics",
  "/coach",
  "/session-iq"
);
const isCommunity = starts(
  "/home/community",
  "/community",
  "/leaderboard",
  "/challenges",
  "/season"
);

export const NAV_TABS: ReadonlyArray<{
  id: TabId;
  label: string;
  path: string;
  match: (path: string) => boolean;
  dataTour?: string;
}> = [
  { id: "today", label: "Oggi", path: TODAY_PATH, match: isToday },
  { id: "feed", label: "Feed", path: FEED_PATH, match: isFeed },
  {
    id: "train",
    label: "Allena",
    path: "/track",
    match: isTrain,
    dataTour: "track-section",
  },
  {
    id: "community",
    label: "Community",
    path: "/home/community",
    match: isCommunity,
    dataTour: "club-directory",
  },
];

export const HUB_TABS: Record<HubId, readonly SectionTab[]> = {
  train: [
    {
      label: "Attività",
      path: "/track",
      match: path => path === "/track" || path === "/activities",
    },
    { label: "Obiettivi", path: "/goals", match: starts("/goals") },
    {
      label: "Statistiche",
      path: "/profile/performance",
      match: starts("/profile/performance", "/statistics"),
    },
    {
      label: "Coach AI",
      path: "/coach",
      match: starts("/coach"),
      dataTour: "ai-coach-btn",
    },
  ],
  community: [
    {
      label: "Club",
      path: "/home/community",
      match: path => path === "/home/community" || path === "/community",
    },
    {
      label: "Classifiche",
      path: "/leaderboard",
      match: starts("/leaderboard"),
    },
    {
      label: "Sfide",
      path: "/challenges",
      match: path => path === "/challenges",
      dataTour: "challenges-list",
    },
  ],
};

export function activeTabForPath(location: string): TabId | null {
  const path = normalizePath(location);
  return NAV_TABS.find(tab => tab.match(path))?.id ?? null;
}

/** The hub whose sub-tabs are shown on this page (hub root pages only, not detail pages). */
export function hubForPath(location: string): HubId | null {
  const path = normalizePath(location);
  for (const hub of Object.keys(HUB_TABS) as HubId[]) {
    if (HUB_TABS[hub].some(tab => tab.match(path))) return hub;
  }
  return null;
}

const TITLES: Array<[(path: string) => boolean, string]> = [
  [isToday, "Oggi"],
  [path => path === FEED_PATH, "Feed"],
  [starts("/post"), "Post"],
  [isReport, "Segnala"],
  [starts("/track", "/activities"), "Allena"],
  [path => hubForPath(path) === "train", "Allena"],
  [path => /^\/challenges\/[^/]+$/.test(path), "Sfida"],
  [path => hubForPath(path) === "community", "Community"],
  [path => /^\/community\/club\/[^/]+\/event\//.test(path), "Evento"],
  [path => /^\/community\/club\/[^/]+\/meet\//.test(path), "Gara"],
  [path => /^\/community\/club\/[^/]+\/documents/.test(path), "Documenti"],
  [starts("/community/club", "/community/invite"), "Club"],
  [starts("/badges"), "Badge"],
  [starts("/profile", "/u"), "Profilo"],
  [starts("/settings"), "Impostazioni"],
  [starts("/messages"), "Messaggi"],
  [starts("/admin"), "Moderazione"],
];

export function pageTitleForPath(location: string): string {
  const path = normalizePath(location);
  return TITLES.find(([match]) => match(path))?.[1] ?? "SwimForge";
}

/** Where a back button goes when there is no in-app history; null on tab roots. */
export function parentPathForPath(location: string): string | null {
  const path = normalizePath(location);
  if (/^\/track\/[^/]+$/.test(path)) return "/track";
  if (/^\/post\/[^/]+$/.test(path)) return FEED_PATH;
  const report = /^(?:\/home)?\/report\/post\/([^/]+)$/.exec(path);
  if (report) return `/post/${report[1]}`;
  if (/^\/challenges\/[^/]+$/.test(path)) return "/challenges";
  // Club sub-pages one level deeper go back to their list (workout → workouts, program → meet).
  if (/^\/community\/club\/[^/]+\/workouts\/[^/]+$/.test(path))
    return path.split("/").slice(0, 5).join("/");
  if (/^\/community\/club\/[^/]+\/meet\/[^/]+\/program$/.test(path))
    return path.split("/").slice(0, 6).join("/");
  if (/^\/community\/club\/[^/]+\/.+/.test(path))
    return path.split("/").slice(0, 4).join("/");
  if (/^\/community\/(?:club|invite)\/[^/]+$/.test(path))
    return "/home/community";
  if (/^\/u\/[^/]+$/.test(path)) return FEED_PATH; // public profiles are reached from the feed
  if (path === "/badges" || path === "/settings") return "/profile";
  return null;
}

/**
 * A page that keeps a sub-view in its query has that page as its way back: Messages with an
 * open chat (`?con=`) or «Nuovo messaggio» (`?new=1`) goes up to the conversation list.
 */
export function inPageParentPath(location: string): string | null {
  const [path, query = ""] = location.split("#")[0].split("?");
  if (normalizePath(path) !== "/messages") return null;
  const params = new URLSearchParams(query);
  return params.has("con") || params.has("new") ? "/messages" : null;
}

/**
 * `raw` as an in-app path (pathname + query + hash), resolved against this site; null for
 * anything that leaves it: another origin, «//host», «/\host» (browsers read the backslash as
 * a slash), an encoded backslash or double slash, an unparsable value. Never throws.
 */
export function toInAppPath(raw: string | null | undefined): string | null {
  if (typeof window === "undefined" || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    // Decoded once more (as a router or a later `?from=` may do), it must still stay here.
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.includes("\\") || decoded.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export const homePathForPlatform = (isNative: boolean) =>
  isNative ? TODAY_PATH : FEED_PATH;
