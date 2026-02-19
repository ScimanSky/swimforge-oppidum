import { coerceBoolean } from "./_shared";

export type ForwardTargetType = "post" | "story";

type ForwardPrivacySettings = {
  profilePublic: boolean;
  activitiesPublic: boolean;
  allowPrivateForwards: boolean;
  forwardsFollowersOnly: boolean;
};

const DEFAULT_FORWARD_PRIVACY: ForwardPrivacySettings = {
  profilePublic: true,
  activitiesPublic: true,
  allowPrivateForwards: true,
  forwardsFollowersOnly: false,
};

function getForwardPrivacyFlag(raw: unknown, key: keyof ForwardPrivacySettings, fallback: boolean) {
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;
  const value = coerceBoolean(record[key]);
  return value === undefined ? fallback : value;
}

function normalizeForwardPrivacySettings(raw: unknown): ForwardPrivacySettings {
  return {
    profilePublic: getForwardPrivacyFlag(raw, "profilePublic", DEFAULT_FORWARD_PRIVACY.profilePublic),
    activitiesPublic: getForwardPrivacyFlag(raw, "activitiesPublic", DEFAULT_FORWARD_PRIVACY.activitiesPublic),
    allowPrivateForwards: getForwardPrivacyFlag(raw, "allowPrivateForwards", DEFAULT_FORWARD_PRIVACY.allowPrivateForwards),
    forwardsFollowersOnly: getForwardPrivacyFlag(raw, "forwardsFollowersOnly", DEFAULT_FORWARD_PRIVACY.forwardsFollowersOnly),
  };
}

export async function getUserForwardPrivacySettings(userId: number): Promise<ForwardPrivacySettings> {
  const { getDb } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) {
    return { ...DEFAULT_FORWARD_PRIVACY };
  }

  const result = await db.execute(sql`
    SELECT privacy_settings
    FROM swimmer_profiles
    WHERE user_id = ${userId}
    LIMIT 1
  `);
  return normalizeForwardPrivacySettings((result.rows[0] as { privacy_settings?: unknown } | undefined)?.privacy_settings);
}

async function isAcceptedFollower(followerId: number, followingId: number) {
  if (followerId === followingId) return true;
  const { getDb } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return false;

  const result = await db.execute(sql`
    SELECT 1
    FROM social_follows
    WHERE follower_id = ${followerId}
      AND following_id = ${followingId}
      AND status = 'accepted'
    LIMIT 1
  `);
  return result.rows.length > 0;
}

export async function getUsersById(userIds: number[]) {
  const { getDb } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db || userIds.length === 0) return [] as Array<{ id: number; name: string | null }>;

  const idsSql = sql.join(
    userIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const result = await db.execute(sql`
    SELECT id, name
    FROM users
    WHERE id IN (${idsSql})
  `);

  return (result.rows as Array<{ id: number; name: string | null }>).map((row) => ({
    id: Number(row.id),
    name: row.name ?? null,
  }));
}

export async function checkForwardRecipientAllowed(input: {
  senderId: number;
  recipientId: number;
  ownerId: number;
  ownerPrivacy: ForwardPrivacySettings;
  targetType: ForwardTargetType;
  visibility?: string | null;
  isActivityPost?: boolean;
}) {
  if (input.recipientId === input.ownerId) return { allowed: true as const, reason: null };

  if (!input.ownerPrivacy.allowPrivateForwards && input.senderId !== input.ownerId) {
    return { allowed: false as const, reason: "L'autore non consente inoltri privati dei suoi contenuti." };
  }

  if (input.targetType === "post" && input.visibility === "private") {
    return { allowed: false as const, reason: "Il post è privato e non può essere inoltrato." };
  }

  const mustBeFollower =
    !input.ownerPrivacy.profilePublic ||
    input.ownerPrivacy.forwardsFollowersOnly ||
    (input.targetType === "post" && input.isActivityPost && !input.ownerPrivacy.activitiesPublic);

  if (mustBeFollower) {
    const follower = await isAcceptedFollower(input.recipientId, input.ownerId);
    if (!follower) {
      return { allowed: false as const, reason: "Solo i follower dell'autore possono ricevere questo inoltro." };
    }
  }

  return { allowed: true as const, reason: null };
}
