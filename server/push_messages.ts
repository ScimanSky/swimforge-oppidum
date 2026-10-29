/**
 * Italian copy and deep-link urls for push notifications (pure, no I/O).
 */

export type PushPayload = {
  title: string;
  body: string;
  /** In-app path opened when the notification is tapped. */
  url: string;
  /** Android notification tag: a newer notification with the same tag replaces the older one. */
  tag?: string;
};

const POST_TYPES = new Set(["reaction", "comment", "mention"]);

/**
 * Notification types that also go out as push. Everything else (follow, splash,
 * meet_*, other club_*, report_update, activity_shared, ...) stays in-app only.
 */
export const PUSH_NOTIFICATION_TYPES: readonly string[] = [
  "reaction",
  "comment",
  "mention",
  "club_workout_published",
];

export function shouldPushNotificationType(type: string): boolean {
  return PUSH_NOTIFICATION_TYPES.includes(type);
}

const PUSH_TITLES: Record<string, string> = {
  reaction: "Nuova reazione",
  comment: "Nuovo commento",
  mention: "Ti hanno menzionato",
  club_workout_published: "Nuovo allenamento del club",
};

function titleForType(type: string, fallback: string): string {
  return PUSH_TITLES[type] ?? (fallback.trim() || "SwimForge");
}

/** Only same-app absolute paths are used as deep links. */
export function isInAppPath(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function buildNotificationPush(params: {
  type: string;
  title: string;
  message: string;
  link?: string | null;
  referenceId?: number | null;
}): PushPayload {
  const title = titleForType(params.type, params.title);
  const body = params.message.trim() || params.title.trim() || title;
  let url = "/home";
  if (isInAppPath(params.link)) {
    url = params.link;
  } else if (POST_TYPES.has(params.type) && params.referenceId) {
    url = `/post/${params.referenceId}`;
  }
  return { title, body, url };
}

const DM_PREVIEW_LENGTH = 100;

/** A tap opens the chat with the sender (`/messages?con=<id>`), else the conversation list. */
export function buildDirectMessagePush(params: {
  senderId: number;
  senderName: string | null | undefined;
  content: string;
  messageType?: "text" | "forward_post";
}): PushPayload {
  const title = params.senderName?.trim() || "Nuovo messaggio";
  let body: string;
  if (params.messageType === "forward_post") {
    body = "Ti ha inoltrato un post";
  } else {
    const text = params.content.replace(/\s+/g, " ").trim();
    body = text.length > DM_PREVIEW_LENGTH ? `${text.slice(0, DM_PREVIEW_LENGTH)}…` : text || "Nuovo messaggio";
  }
  const validSender = Number.isInteger(params.senderId) && params.senderId > 0;
  const url = validSender ? `/messages?con=${params.senderId}` : "/messages";
  return { title, body, url, tag: "dm" };
}

export function buildGarminSyncPush(newActivities: number): PushPayload {
  return {
    title: "Sincronizzazione Garmin completata",
    body: newActivities === 1 ? "1 nuova attività importata" : `${newActivities} nuove attività importate`,
    url: "/track",
    tag: "garmin-sync",
  };
}

const STROKE_LABELS: Record<string, string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Delfino",
  mixed: "Misti",
};

/** 6532 → "1:05.32", 3207 → "32.07". */
export function formatRecordTime(timeCs: number): string {
  const value = Math.max(0, Math.round(timeCs));
  const minutes = Math.floor(value / 6000);
  const seconds = Math.floor((value % 6000) / 100);
  const centiseconds = String(value % 100).padStart(2, "0");
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${centiseconds}`
    : `${seconds}.${centiseconds}`;
}

export type PersonalRecordSummary = { strokeType: string; distanceMeters: number; newTimeCs: number };

export function buildPersonalRecordPush(records: PersonalRecordSummary[]): PushPayload | null {
  const [first] = records;
  if (!first) return null;
  const stroke = STROKE_LABELS[first.strokeType] ?? first.strokeType;
  const extra = records.length - 1;
  const body =
    `${stroke} ${first.distanceMeters}m in ${formatRecordTime(first.newTimeCs)}` +
    (extra > 0 ? ` e altri ${extra} record` : "");
  return { title: "Nuovo record personale!", body, url: "/profile", tag: "garmin-pb" };
}
