import type { Request } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { userConsents } from "../drizzle/schema";
import { getDb } from "./db";

export const CONSENT_TYPES = [
  "terms_acceptance",
  "privacy_policy",
  "health_data_processing",
  "garmin_sync",
  "strava_sync",
  "marketing_communications",
  "cookie_analytics",
  "product_onboarding_tour",
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_VERSION: Record<ConsentType, string> = {
  terms_acceptance: "v1.1",
  privacy_policy: "v1.1",
  health_data_processing: "v1.0",
  garmin_sync: "v1.0",
  strava_sync: "v1.0",
  marketing_communications: "v1.0",
  cookie_analytics: "v1.0",
  product_onboarding_tour: "v1.0",
};

export type ConsentState = {
  id: number;
  consentType: ConsentType;
  consentVersion: string;
  granted: boolean;
  grantedAt: string | null;
  withdrawnAt: string | null;
  updatedAt: string;
};

function getIpFromRequest(req?: Request): string | null {
  if (!req) return null;
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]
      : null;
  const ip = (first || req.ip || "").toString().trim();
  if (!ip) return null;
  return ip.slice(0, 45);
}

function getUserAgentFromRequest(req?: Request): string | null {
  if (!req) return null;
  const value = req.headers["user-agent"];
  if (!value) return null;
  const userAgent = Array.isArray(value) ? value.join(";") : value;
  return userAgent.slice(0, 2048);
}

export async function listLatestUserConsents(userId: number): Promise<ConsentState[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute(sql`
    SELECT DISTINCT ON (consent_type)
      id,
      consent_type,
      consent_version,
      granted,
      granted_at,
      withdrawn_at,
      updated_at
    FROM user_consents
    WHERE user_id = ${userId}
    ORDER BY consent_type, created_at DESC, id DESC
  `);

  return rows.rows.map((row) => {
    const record = row as {
      id: number;
      consent_type: string;
      consent_version: string;
      granted: boolean;
      granted_at: string | null;
      withdrawn_at: string | null;
      updated_at: string;
    };

    return {
      id: Number(record.id),
      consentType: record.consent_type as ConsentType,
      consentVersion: record.consent_version,
      granted: Boolean(record.granted),
      grantedAt: record.granted_at,
      withdrawnAt: record.withdrawn_at,
      updatedAt: record.updated_at,
    };
  });
}

export async function setUserConsent(params: {
  userId: number;
  consentType: ConsentType;
  granted: boolean;
  consentVersion?: string;
  req?: Request;
}): Promise<ConsentState | null> {
  const db = await getDb();
  if (!db) return null;

  const consentVersion = params.consentVersion || CONSENT_VERSION[params.consentType];
  const ipAddress = getIpFromRequest(params.req);
  const userAgent = getUserAgentFromRequest(params.req);

  const [row] = await db
    .insert(userConsents)
    .values({
      userId: params.userId,
      consentType: params.consentType,
      consentVersion,
      granted: params.granted,
      grantedAt: params.granted ? new Date() : null,
      withdrawnAt: params.granted ? null : new Date(),
      ipAddress,
      userAgent,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userConsents.userId, userConsents.consentType, userConsents.consentVersion],
      set: {
        granted: params.granted,
        grantedAt: params.granted ? new Date() : null,
        withdrawnAt: params.granted ? null : new Date(),
        ipAddress,
        userAgent,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: userConsents.id,
      consentType: userConsents.consentType,
      consentVersion: userConsents.consentVersion,
      granted: userConsents.granted,
      grantedAt: userConsents.grantedAt,
      withdrawnAt: userConsents.withdrawnAt,
      updatedAt: userConsents.updatedAt,
    });

  if (!row) return null;

  return {
    id: Number(row.id),
    consentType: row.consentType as ConsentType,
    consentVersion: row.consentVersion,
    granted: Boolean(row.granted),
    grantedAt: row.grantedAt ? new Date(row.grantedAt).toISOString() : null,
    withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function setManyConsents(params: {
  userId: number;
  items: Array<{ consentType: ConsentType; granted: boolean; consentVersion?: string }>;
  req?: Request;
}): Promise<ConsentState[]> {
  const results: ConsentState[] = [];
  for (const item of params.items) {
    const next = await setUserConsent({
      userId: params.userId,
      consentType: item.consentType,
      granted: item.granted,
      consentVersion: item.consentVersion,
      req: params.req,
    });
    if (next) results.push(next);
  }
  return results;
}

export async function hasGrantedConsent(userId: number, consentType: ConsentType): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [row] = await db
    .select({ granted: userConsents.granted })
    .from(userConsents)
    .where(and(eq(userConsents.userId, userId), eq(userConsents.consentType, consentType)))
    .orderBy(desc(userConsents.createdAt), desc(userConsents.id))
    .limit(1);

  return Boolean(row?.granted);
}

export async function ensureRequiredLegalConsents(userId: number, req?: Request): Promise<void> {
  const [hasTerms, hasPrivacy] = await Promise.all([
    hasGrantedConsent(userId, "terms_acceptance"),
    hasGrantedConsent(userId, "privacy_policy"),
  ]);

  const items: Array<{ consentType: ConsentType; granted: boolean; consentVersion?: string }> = [];
  if (!hasTerms) {
    items.push({
      consentType: "terms_acceptance",
      granted: true,
      consentVersion: CONSENT_VERSION.terms_acceptance,
    });
  }
  if (!hasPrivacy) {
    items.push({
      consentType: "privacy_policy",
      granted: true,
      consentVersion: CONSENT_VERSION.privacy_policy,
    });
  }

  if (items.length === 0) return;
  await setManyConsents({ userId, req, items });
}
