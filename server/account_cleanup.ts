/**
 * What a deleted account leaves outside the database, removed after its rows are gone: the media
 * on ImageKit, Cloudinary and Supabase Storage, and the Garmin session on the garmin-service.
 * Best effort: every failure is logged and none blocks the deletion.
 *
 * Where the user's media live (folders set by the upload endpoints):
 * - avatar and cover: profiles/{userId}/ on ImageKit or Cloudinary (images), or profiles/{userId}/
 *   in the Supabase Storage bucket profile-media (old client fallback);
 * - post images: posts/{userId}/ on ImageKit or Cloudinary (images); post videos: posts/{userId}/
 *   on Cloudinary (videos);
 * - club uploads (gallery photos and PDFs, videos of club posts): clubs/{clubId}/{userId}/ on
 *   ImageKit, Cloudinary or Supabase Storage. That folder also holds the club logo and cover the
 *   user uploaded as staff, which belong to the club: only the files of the user's own deleted
 *   rows are removed there, never one the club still shows;
 * - stories (legacy): ImageKit file IDs.
 * Direct messages carry no uploaded media: forwards point at posts.
 */
import { sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getSupabaseAdminClient } from "./_core/supabase_admin";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";
import type { SqlExecutor } from "./lib/relation-exists";
import { withTimeout } from "./lib/with-timeout";
import { logger } from "./middleware/logger";

const log = logger.child({ component: "account_cleanup" });

const PROVIDER_TIMEOUT_MS = 15_000;
/** ImageKit answers 429 to bursts: a user with hundreds of club uploads is deleted 4 files at a time. */
const IMAGEKIT_CONCURRENCY = 4;
const PROFILE_MEDIA_BUCKET = "profile-media";
/** Cloudinary deletes at most 1,000 resources per call by prefix: a few rounds at most. */
const MAX_CLOUDINARY_PREFIX_ROUNDS = 10;

export type UserMediaRefs = {
  userId: number;
  /** ImageKit file IDs stored with the user's stories. */
  imageKitFileIds: string[];
  /** URLs of the user's rows (profile, posts, stories, club uploads), read before the deletion. */
  urls: string[];
  /** Club logos and covers in the user's club folders: the club still uses them. */
  keepUrls: string[];
};

export type ProviderCleanup = { attempted: number; failed: number };
export type AccountCleanupReport = {
  imagekit: ProviderCleanup;
  cloudinary: ProviderCleanup;
  supabase: ProviderCleanup;
  garmin: "logged_out" | "failed" | "skipped";
};

function isMissingRelation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");
}

/** Rows of a read that may hit a table missing on older databases (then none). */
async function readRows(db: SqlExecutor, query: ReturnType<typeof sql>): Promise<Record<string, unknown>[]> {
  try {
    return (await db.execute(query)).rows as Record<string, unknown>[];
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

const textValues = (rows: Record<string, unknown>[], key: string) =>
  rows
    .map((row) => row[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());

/**
 * The user's media references, read before the account rows are deleted. The logo and cover of
 * the clubs in `deletedClubIds` (deleted with the account) are not kept.
 */
export async function collectUserMediaRefs(
  db: SqlExecutor,
  userId: number,
  deletedClubIds: number[] = [],
): Promise<UserMediaRefs> {
  const ownClubFolder = `%/clubs/%/${userId}/%`;
  const keptClubs = deletedClubIds.length
    ? sql` AND id NOT IN (${sql.join(
        deletedClubIds.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql``;
  const [stories, profile, posts, clubMedia, clubImages] = await Promise.all([
    readRows(db, sql`SELECT imagekit_file_id, media_url FROM stories WHERE user_id = ${userId}`),
    readRows(db, sql`SELECT avatar_url, cover_url FROM swimmer_profiles WHERE user_id = ${userId}`),
    readRows(
      db,
      sql`SELECT media_url AS url FROM social_posts WHERE user_id = ${userId}
          UNION SELECT unnest(media_urls) AS url FROM social_posts WHERE user_id = ${userId}`,
    ),
    readRows(db, sql`SELECT media_url, thumbnail_url FROM club_media WHERE uploader_id = ${userId}`),
    readRows(
      db,
      sql`SELECT logo_url AS url FROM community_clubs WHERE logo_url LIKE ${ownClubFolder}${keptClubs}
          UNION SELECT cover_image_url AS url FROM community_clubs WHERE cover_image_url LIKE ${ownClubFolder}${keptClubs}`,
    ),
  ]);

  const urls = [
    ...textValues(stories, "media_url"),
    ...textValues(profile, "avatar_url"),
    ...textValues(profile, "cover_url"),
    ...textValues(posts, "url"),
    ...textValues(clubMedia, "media_url"),
    ...textValues(clubMedia, "thumbnail_url"),
  ];
  return {
    userId,
    imageKitFileIds: Array.from(new Set(textValues(stories, "imagekit_file_id"))),
    urls: Array.from(new Set(urls)),
    keepUrls: Array.from(new Set(textValues(clubImages, "url"))),
  };
}

/** clubs/{clubId}/{userId}/…: a file the user uploaded to a club. */
export function isOwnClubUploadPath(path: string, userId: number): boolean {
  return new RegExp(`^/?clubs/\\d+/${userId}/`).test(path);
}

const stripQuery = (url: URL) => decodeURIComponent(url.pathname);

/** «/clubs/3/9/a.jpg» from an ImageKit URL of our endpoint (path transformations dropped). */
export function imageKitPathFromUrl(rawUrl: string, urlEndpoint: string = ENV.imagekitUrlEndpoint): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  let path: string;
  const endpoint = urlEndpoint.replace(/\/+$/, "");
  if (endpoint && rawUrl.startsWith(`${endpoint}/`)) {
    path = stripQuery(new URL(rawUrl.slice(endpoint.length), "https://x"));
  } else if (url.hostname === "ik.imagekit.io") {
    // https://ik.imagekit.io/{imagekitId}/path
    path = `/${stripQuery(url).split("/").slice(2).join("/")}`;
  } else {
    return null;
  }
  const segments = path.split("/").filter((segment) => segment && !segment.startsWith("tr:"));
  return segments.length ? `/${segments.join("/")}` : null;
}

/** Resource type and public ID of a Cloudinary delivery URL of our cloud. */
export function cloudinaryAssetFromUrl(
  rawUrl: string,
  cloudName: string = ENV.cloudinaryCloudName,
): { resourceType: string; publicId: string } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "res.cloudinary.com" || !cloudName) return null;
  const [cloud, resourceType, deliveryType, ...rest] = stripQuery(url).split("/").filter(Boolean);
  if (cloud !== cloudName || deliveryType !== "upload" || !resourceType || rest.length === 0) return null;
  const versionIndex = rest.findIndex((segment) => /^v\d+$/.test(segment));
  const idSegments = versionIndex >= 0 ? rest.slice(versionIndex + 1) : rest;
  const publicId = idSegments.join("/").replace(/\.[a-z0-9]+$/i, "");
  return publicId ? { resourceType, publicId } : null;
}

/** Bucket and object path of a Supabase Storage public URL of our project. */
export function supabaseObjectFromUrl(
  rawUrl: string,
  supabaseUrl: string = ENV.supabaseUrl,
): { bucket: string; path: string } | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(rawUrl);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (url.host !== base.host) return null;
  const match = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(stripQuery(url));
  return match ? { bucket: match[1], path: match[2] } : null;
}

// ---------------------------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------------------------

function imageKitAuth(): string {
  return `Basic ${Buffer.from(`${ENV.imagekitPrivateKey}:`).toString("base64")}`;
}

async function imageKitDeleteFile(fileId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", headers: { Authorization: imageKitAuth() } },
    PROVIDER_TIMEOUT_MS,
    "account_cleanup:imagekit_file",
  );
  if (!response.ok && response.status !== 404) throw new Error(`ImageKit file delete failed (${response.status})`);
}

async function imageKitDeleteFolder(folderPath: string): Promise<void> {
  const response = await fetchWithTimeout(
    "https://api.imagekit.io/v1/folder",
    {
      method: "DELETE",
      headers: { Authorization: imageKitAuth(), "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
    },
    PROVIDER_TIMEOUT_MS,
    "account_cleanup:imagekit_folder",
  );
  if (!response.ok && response.status !== 404) throw new Error(`ImageKit folder delete failed (${response.status})`);
}

/** The ImageKit file at `path` («/clubs/3/9/a.jpg»), found by folder and name, then deleted. */
async function imageKitDeleteByPath(path: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash) || "/";
  const name = path.slice(slash + 1);
  const query = new URLSearchParams({ path: folder, searchQuery: `name = "${name}"` });
  const response = await fetchWithTimeout(
    `https://api.imagekit.io/v1/files?${query.toString()}`,
    { method: "GET", headers: { Authorization: imageKitAuth() } },
    PROVIDER_TIMEOUT_MS,
    "account_cleanup:imagekit_lookup",
  );
  if (!response.ok) throw new Error(`ImageKit lookup failed (${response.status})`);
  const files = (await response.json()) as Array<{ fileId?: string; filePath?: string; type?: string }>;
  for (const file of Array.isArray(files) ? files : []) {
    if (file.fileId && file.filePath === path && file.type !== "folder") await imageKitDeleteFile(file.fileId);
  }
}

function cloudinaryAuth(): string {
  return `Basic ${Buffer.from(`${ENV.cloudinaryApiKey}:${ENV.cloudinaryApiSecret}`).toString("base64")}`;
}

async function cloudinaryDelete(resourceType: string, params: URLSearchParams): Promise<{ partial: boolean }> {
  const response = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${ENV.cloudinaryCloudName}/resources/${resourceType}/upload?${params.toString()}`,
    { method: "DELETE", headers: { Authorization: cloudinaryAuth() } },
    PROVIDER_TIMEOUT_MS,
    "account_cleanup:cloudinary",
  );
  if (!response.ok && response.status !== 404) throw new Error(`Cloudinary delete failed (${response.status})`);
  const payload = (await response.json().catch(() => ({}))) as { partial?: boolean };
  return { partial: Boolean(payload.partial) };
}

async function cloudinaryDeletePrefix(resourceType: "image" | "video", prefix: string): Promise<void> {
  for (let round = 0; round < MAX_CLOUDINARY_PREFIX_ROUNDS; round += 1) {
    const { partial } = await cloudinaryDelete(resourceType, new URLSearchParams({ prefix }));
    if (!partial) return;
  }
}

async function cloudinaryDeletePublicIds(resourceType: string, publicIds: string[]): Promise<void> {
  for (let start = 0; start < publicIds.length; start += 100) {
    const params = new URLSearchParams();
    for (const id of publicIds.slice(start, start + 100)) params.append("public_ids[]", id);
    await cloudinaryDelete(resourceType, params);
  }
}

// The Supabase client has no request timeout of its own: every call is bounded here.
async function supabaseRemove(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await withTimeout(
    getSupabaseAdminClient().storage.from(bucket).remove(paths),
    PROVIDER_TIMEOUT_MS,
    "supabase storage remove",
  );
  if (error) throw new Error(`Supabase Storage remove failed: ${error.message}`);
}

async function supabaseRemoveFolder(bucket: string, folder: string): Promise<void> {
  const storage = getSupabaseAdminClient().storage.from(bucket);
  const { data, error } = await withTimeout(
    storage.list(folder, { limit: 1000 }),
    PROVIDER_TIMEOUT_MS,
    "supabase storage list",
  );
  if (error) throw new Error(`Supabase Storage list failed: ${error.message}`);
  const files = (data ?? []).filter((item) => item.id !== null).map((item) => `${folder}/${item.name}`);
  await supabaseRemove(bucket, files);
}

/** Runs the tasks, at most `concurrency` at a time, settling each (never rejects). */
async function settleWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number,
): Promise<PromiseSettledResult<void>[]> {
  const results: PromiseSettledResult<void>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      try {
        await tasks[index]();
        results[index] = { status: "fulfilled", value: undefined };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

/** Runs every task, counting the failures (logged with the provider and the user). */
async function runAll(
  provider: keyof Omit<AccountCleanupReport, "garmin">,
  userId: number,
  tasks: Array<() => Promise<void>>,
  concurrency: number = Number.POSITIVE_INFINITY,
): Promise<ProviderCleanup> {
  const results = await settleWithConcurrency(tasks, concurrency);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failures.length > 0) {
    log.warn(`[Account cleanup] ${failures.length}/${tasks.length} ${provider} deletions failed`, {
      event: "account:media_cleanup_partial_failure",
      provider,
      userId,
      failedCount: failures.length,
      messages: failures.slice(0, 5).map((failure) => String(failure.reason?.message ?? failure.reason)),
    });
  }
  return { attempted: tasks.length, failed: failures.length };
}

/** Deletes the user's media on the three providers (the ones configured). Never throws. */
export async function deleteUserMedia(refs: UserMediaRefs): Promise<Omit<AccountCleanupReport, "garmin">> {
  const { userId } = refs;
  const keep = new Set(refs.keepUrls);
  // Outside the user's own folders (deleted whole) only the club uploads among the user's rows,
  // never a logo or cover the club still shows.
  const clubUploads = refs.urls.filter((url) => !keep.has(url));

  const imageKitTasks: Array<() => Promise<void>> = [];
  if (ENV.imagekitPrivateKey) {
    for (const fileId of refs.imageKitFileIds) imageKitTasks.push(() => imageKitDeleteFile(fileId));
    for (const folder of [`/profiles/${userId}`, `/posts/${userId}`]) {
      imageKitTasks.push(() => imageKitDeleteFolder(folder));
    }
    for (const url of clubUploads) {
      const path = imageKitPathFromUrl(url);
      if (path && isOwnClubUploadPath(path, userId)) imageKitTasks.push(() => imageKitDeleteByPath(path));
    }
  }

  const cloudinaryTasks: Array<() => Promise<void>> = [];
  if (ENV.cloudinaryCloudName && ENV.cloudinaryApiKey && ENV.cloudinaryApiSecret) {
    cloudinaryTasks.push(() => cloudinaryDeletePrefix("image", `profiles/${userId}/`));
    cloudinaryTasks.push(() => cloudinaryDeletePrefix("image", `posts/${userId}/`));
    cloudinaryTasks.push(() => cloudinaryDeletePrefix("video", `posts/${userId}/`));
    const byType = new Map<string, string[]>();
    for (const url of clubUploads) {
      const asset = cloudinaryAssetFromUrl(url);
      if (!asset || !isOwnClubUploadPath(asset.publicId, userId)) continue;
      byType.set(asset.resourceType, [...(byType.get(asset.resourceType) ?? []), asset.publicId]);
    }
    for (const [resourceType, publicIds] of Array.from(byType)) {
      cloudinaryTasks.push(() => cloudinaryDeletePublicIds(resourceType, publicIds));
    }
  }

  const supabaseTasks: Array<() => Promise<void>> = [];
  if (ENV.supabaseUrl && ENV.supabaseServiceRoleKey) {
    supabaseTasks.push(() => supabaseRemoveFolder(PROFILE_MEDIA_BUCKET, `profiles/${userId}`));
    const byBucket = new Map<string, string[]>();
    for (const url of clubUploads) {
      const object = supabaseObjectFromUrl(url);
      if (!object || !isOwnClubUploadPath(object.path, userId)) continue;
      byBucket.set(object.bucket, [...(byBucket.get(object.bucket) ?? []), object.path]);
    }
    for (const [bucket, paths] of Array.from(byBucket)) supabaseTasks.push(() => supabaseRemove(bucket, paths));
  }

  const [imagekit, cloudinary, supabase] = await Promise.all([
    runAll("imagekit", userId, imageKitTasks, IMAGEKIT_CONCURRENCY),
    runAll("cloudinary", userId, cloudinaryTasks),
    runAll("supabase", userId, supabaseTasks),
  ]);
  return { imagekit, cloudinary, supabase };
}

/** Removes the user's Garmin session and token file on the garmin-service. Never throws. */
async function logoutGarmin(userId: number): Promise<AccountCleanupReport["garmin"]> {
  if (!process.env.GARMIN_SERVICE_SECRET) return "skipped";
  try {
    const { logoutGarminService } = await import("./garmin");
    // The service call waits up to a minute for syncs: the deletion does not.
    await withTimeout(logoutGarminService(userId), PROVIDER_TIMEOUT_MS, "garmin-service logout");
    return "logged_out";
  } catch (error) {
    log.warn("[Account cleanup] Garmin service logout failed", {
      event: "account:garmin_logout_failed",
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

/**
 * Everything outside the database of a deleted account: media and the Garmin session. Run after
 * the database transaction, never inside it; deleteUserAccount starts it detached, so the answer
 * never waits for the providers. Every provider call is bounded (15 s). Never throws.
 */
export async function cleanupDeletedAccount(refs: UserMediaRefs): Promise<AccountCleanupReport> {
  const [media, garmin] = await Promise.all([
    deleteUserMedia(refs).catch((error: unknown) => {
      log.warn("[Account cleanup] Media cleanup failed", {
        event: "account:media_cleanup_failed",
        userId: refs.userId,
        message: error instanceof Error ? error.message : String(error),
      });
      const none = { attempted: 0, failed: 0 };
      return { imagekit: none, cloudinary: none, supabase: none };
    }),
    logoutGarmin(refs.userId),
  ]);
  const report = { ...media, garmin };
  log.info("[Account cleanup] External data of the deleted account removed", {
    event: "account:external_cleanup_done",
    userId: refs.userId,
    ...report,
  });
  return report;
}
