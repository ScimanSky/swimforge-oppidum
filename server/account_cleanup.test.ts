import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const storage = {
    list: vi.fn(),
    remove: vi.fn(),
  };
  return {
    env: {
      imagekitPrivateKey: "ik-private",
      imagekitUrlEndpoint: "https://ik.imagekit.io/swimforge",
      cloudinaryCloudName: "swimcloud",
      cloudinaryApiKey: "cl-key",
      cloudinaryApiSecret: "cl-secret",
      supabaseUrl: "https://abc.supabase.co",
      supabaseServiceRoleKey: "service-role",
    },
    storage,
    from: vi.fn(() => storage),
    logoutGarminService: vi.fn(),
  };
});

vi.mock("./_core/env", () => ({ ENV: m.env }));
vi.mock("./_core/supabase_admin", () => ({ getSupabaseAdminClient: () => ({ storage: { from: m.from } }) }));
vi.mock("./garmin", () => ({ logoutGarminService: m.logoutGarminService }));

import {
  cleanupDeletedAccount,
  cloudinaryAssetFromUrl,
  collectUserMediaRefs,
  imageKitPathFromUrl,
  isOwnClubUploadPath,
  supabaseObjectFromUrl,
  type UserMediaRefs,
} from "./account_cleanup";

type FetchCall = { url: string; method: string; body?: string };
const fetchCalls: FetchCall[] = [];
const defaultFetch = async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  fetchCalls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
  if (url.startsWith("https://api.imagekit.io/v1/files?")) {
    const path = new URL(url).searchParams.get("path");
    const name = /name = "(.+)"/.exec(new URL(url).searchParams.get("searchQuery") ?? "")?.[1];
    return new Response(JSON.stringify([{ fileId: `id-of-${name}`, filePath: `${path}/${name}`, type: "file" }]), { status: 200 });
  }
  if (url.startsWith("https://api.cloudinary.com/")) {
    return new Response(JSON.stringify({ deleted: {}, partial: false }), { status: 200 });
  }
  return new Response(null, { status: 204 });
};
const fetchMock = vi.fn(defaultFetch);
vi.stubGlobal("fetch", fetchMock);

const previousGarminSecret = process.env.GARMIN_SERVICE_SECRET;
afterAll(() => {
  if (previousGarminSecret === undefined) delete process.env.GARMIN_SERVICE_SECRET;
  else process.env.GARMIN_SERVICE_SECRET = previousGarminSecret;
});

const refs = (overrides: Partial<UserMediaRefs> = {}): UserMediaRefs => ({
  userId: 9,
  imageKitFileIds: ["story-file-1"],
  urls: [
    // In the user's own folders: deleted with the folders.
    "https://ik.imagekit.io/swimforge/profiles/9/avatar-1.jpg",
    "https://ik.imagekit.io/swimforge/posts/9/post-1.jpg",
    // Club uploads of the user, on the three providers.
    "https://ik.imagekit.io/swimforge/tr:w-400/clubs/3/9/gallery-1.jpg?updatedAt=1",
    "https://res.cloudinary.com/swimcloud/video/upload/v1730000000/clubs/3/9/clip-1.mp4",
    "https://abc.supabase.co/storage/v1/object/public/profile-media/clubs/3/9/docs/123-regole.pdf",
    // Someone else's club upload (e.g. a URL set by hand): never deleted.
    "https://ik.imagekit.io/swimforge/clubs/3/10/gallery-2.jpg",
    // The club logo the user uploaded as staff: the club keeps it.
    "https://ik.imagekit.io/swimforge/clubs/3/9/logo-1.png",
  ],
  keepUrls: ["https://ik.imagekit.io/swimforge/clubs/3/9/logo-1.png"],
  ...overrides,
});

describe("media URL parsing", () => {
  it("reads the ImageKit path of our endpoint, without transformations or query", () => {
    expect(imageKitPathFromUrl("https://ik.imagekit.io/swimforge/tr:w-400/clubs/3/9/a.jpg?tr=h-2", "https://ik.imagekit.io/swimforge")).toBe(
      "/clubs/3/9/a.jpg",
    );
    expect(imageKitPathFromUrl("https://ik.imagekit.io/other/posts/9/a.jpg", "")).toBe("/posts/9/a.jpg");
    expect(imageKitPathFromUrl("https://example.com/posts/9/a.jpg", "https://ik.imagekit.io/swimforge")).toBeNull();
  });

  it("reads the Cloudinary resource type and public ID of our cloud", () => {
    expect(cloudinaryAssetFromUrl("https://res.cloudinary.com/swimcloud/video/upload/v17/clubs/3/9/clip.mp4", "swimcloud")).toEqual({
      resourceType: "video",
      publicId: "clubs/3/9/clip",
    });
    expect(cloudinaryAssetFromUrl("https://res.cloudinary.com/othercloud/image/upload/v1/posts/9/a.jpg", "swimcloud")).toBeNull();
  });

  it("reads the Supabase Storage bucket and path of our project", () => {
    expect(supabaseObjectFromUrl("https://abc.supabase.co/storage/v1/object/public/profile-media/profiles/9/avatar.png", "https://abc.supabase.co")).toEqual({
      bucket: "profile-media",
      path: "profiles/9/avatar.png",
    });
    expect(supabaseObjectFromUrl("https://evil.example/storage/v1/object/public/profile-media/x.png", "https://abc.supabase.co")).toBeNull();
  });

  it("owns only clubs/{clubId}/{userId}/", () => {
    expect(isOwnClubUploadPath("/clubs/3/9/a.jpg", 9)).toBe(true);
    expect(isOwnClubUploadPath("clubs/3/9/docs/a.pdf", 9)).toBe(true);
    expect(isOwnClubUploadPath("/clubs/3/19/a.jpg", 9)).toBe(false);
    expect(isOwnClubUploadPath("/clubs/3/branding/a.jpg", 9)).toBe(false);
  });
});

describe("collectUserMediaRefs", () => {
  it("reads stories, profile, posts and club uploads, and the club images to keep", async () => {
    const rowsByQuery: Array<[RegExp, Record<string, unknown>[]]> = [
      [/FROM stories/, [{ imagekit_file_id: "f1", media_url: "https://ik.imagekit.io/swimforge/stories/9/s.jpg" }]],
      [/FROM swimmer_profiles/, [{ avatar_url: "https://ik.imagekit.io/swimforge/profiles/9/a.jpg", cover_url: null }]],
      [/FROM social_posts/, [{ url: "https://ik.imagekit.io/swimforge/posts/9/p.jpg" }, { url: null }]],
      [/FROM club_media/, [{ media_url: "https://ik.imagekit.io/swimforge/clubs/3/9/g.jpg", thumbnail_url: "" }]],
      [/FROM community_clubs/, [{ url: "https://ik.imagekit.io/swimforge/clubs/3/9/logo.png" }]],
    ];
    const db = {
      execute: vi.fn(async (query: any) => {
        const text = query.queryChunks.map((chunk: any) => (Array.isArray(chunk?.value) ? chunk.value.join("") : "")).join("");
        return { rows: rowsByQuery.find(([pattern]) => pattern.test(text))?.[1] ?? [] };
      }),
    };
    await expect(collectUserMediaRefs(db, 9)).resolves.toEqual({
      userId: 9,
      imageKitFileIds: ["f1"],
      urls: [
        "https://ik.imagekit.io/swimforge/stories/9/s.jpg",
        "https://ik.imagekit.io/swimforge/profiles/9/a.jpg",
        "https://ik.imagekit.io/swimforge/posts/9/p.jpg",
        "https://ik.imagekit.io/swimforge/clubs/3/9/g.jpg",
      ],
      keepUrls: ["https://ik.imagekit.io/swimforge/clubs/3/9/logo.png"],
    });
  });

  it("treats a table missing on an older database as empty", async () => {
    const db = { execute: vi.fn(async () => Promise.reject(Object.assign(new Error("no table"), { code: "42P01" }))) };
    await expect(collectUserMediaRefs(db, 9)).resolves.toEqual({ userId: 9, imageKitFileIds: [], urls: [], keepUrls: [] });
  });
});

describe("cleanupDeletedAccount", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
    fetchMock.mockClear();
    m.from.mockClear();
    m.storage.list.mockReset().mockResolvedValue({
      data: [
        { id: "a", name: "avatar-1.png" },
        { id: "b", name: "cover-1.png" },
      ],
      error: null,
    });
    m.storage.remove.mockReset().mockResolvedValue({ data: [], error: null });
    m.logoutGarminService.mockReset().mockResolvedValue(undefined);
    process.env.GARMIN_SERVICE_SECRET = "garmin-secret";
  });

  it("deletes the user's ImageKit folders, story files and own club uploads, nothing else", async () => {
    const report = await cleanupDeletedAccount(refs());
    const imagekit = fetchCalls.filter((call) => call.url.startsWith("https://api.imagekit.io/"));
    expect(imagekit.filter((call) => call.url.endsWith("/v1/folder")).map((call) => JSON.parse(call.body ?? "{}").folderPath)).toEqual([
      "/profiles/9",
      "/posts/9",
    ]);
    const deletedFiles = imagekit.filter((call) => call.method === "DELETE" && call.url.includes("/v1/files/")).map((call) => call.url);
    expect(deletedFiles).toEqual(
      expect.arrayContaining([
        "https://api.imagekit.io/v1/files/story-file-1",
        "https://api.imagekit.io/v1/files/id-of-gallery-1.jpg",
      ]),
    );
    expect(deletedFiles).toHaveLength(2);
    expect(fetchCalls.some((call) => call.url.includes("gallery-2") || call.url.includes("logo-1"))).toBe(false);
    expect(report.imagekit).toEqual({ attempted: 4, failed: 0 });
  });

  it("deletes the user's Cloudinary images and videos by prefix and their club videos by public ID", async () => {
    await cleanupDeletedAccount(refs());
    const cloudinary = fetchCalls
      .filter((call) => call.url.startsWith("https://api.cloudinary.com/v1_1/swimcloud/resources/"))
      .map((call) => decodeURIComponent(call.url.replace("https://api.cloudinary.com/v1_1/swimcloud/resources/", "")));
    expect(cloudinary.every((url) => url.startsWith("image/upload?") || url.startsWith("video/upload?"))).toBe(true);
    expect(cloudinary).toEqual(
      expect.arrayContaining([
        "image/upload?prefix=profiles/9/",
        "image/upload?prefix=posts/9/",
        "video/upload?prefix=posts/9/",
        "video/upload?public_ids[]=clubs/3/9/clip-1",
      ]),
    );
    expect(fetchCalls.filter((call) => call.url.includes("cloudinary")).every((call) => call.method === "DELETE")).toBe(true);
  });

  it("deletes the user's Supabase Storage profile folder and club documents", async () => {
    await cleanupDeletedAccount(refs());
    expect(m.from).toHaveBeenCalledWith("profile-media");
    expect(m.storage.list).toHaveBeenCalledWith("profiles/9", { limit: 1000 });
    expect(m.storage.remove).toHaveBeenCalledWith(["profiles/9/avatar-1.png", "profiles/9/cover-1.png"]);
    expect(m.storage.remove).toHaveBeenCalledWith(["clubs/3/9/docs/123-regole.pdf"]);
  });

  it("logs the user out of the garmin-service", async () => {
    const report = await cleanupDeletedAccount(refs());
    expect(m.logoutGarminService).toHaveBeenCalledWith(9);
    expect(report.garmin).toBe("logged_out");
  });

  it("never throws: provider and Garmin failures are counted and logged", async () => {
    fetchMock.mockImplementationOnce(async () => new Response("boom", { status: 500 }));
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("network down");
    });
    m.storage.list.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    m.logoutGarminService.mockRejectedValueOnce(new Error("HTTP 503"));
    const report = await cleanupDeletedAccount(refs());
    expect(report.garmin).toBe("failed");
    expect(report.imagekit.failed + report.cloudinary.failed).toBeGreaterThanOrEqual(1);
    expect(report.supabase.failed).toBe(1);
  });

  describe("never hangs", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("gives up a Supabase Storage list that never answers after 15 s", async () => {
      vi.useFakeTimers();
      m.storage.list.mockReturnValue(new Promise(() => {}));
      const pending = cleanupDeletedAccount(refs());
      await vi.advanceTimersByTimeAsync(14_999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const report = await pending;
      // The profile folder (list never answered) failed; the club document removal went through.
      expect(report.supabase).toEqual({ attempted: 2, failed: 1 });
    });

    it("gives up a Supabase Storage remove that never answers after 15 s", async () => {
      vi.useFakeTimers();
      m.storage.remove.mockReturnValue(new Promise(() => {}));
      const pending = cleanupDeletedAccount(refs());
      await vi.advanceTimersByTimeAsync(15_000);
      const report = await pending;
      expect(report.supabase).toEqual({ attempted: 2, failed: 2 });
    });

    it("sends at most 4 ImageKit requests at a time", async () => {
      const uploads = Array.from({ length: 12 }, (_, i) => `https://ik.imagekit.io/swimforge/clubs/3/9/photo-${i}.jpg`);
      let inFlight = 0;
      let maxInFlight = 0;
      fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        fetchCalls.push({ url, method: init?.method ?? "GET" });
        if (!url.startsWith("https://api.imagekit.io/")) return new Response(JSON.stringify({ partial: false }), { status: 200 });
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        if (url.startsWith("https://api.imagekit.io/v1/files?")) return new Response("[]", { status: 200 });
        return new Response(null, { status: 204 });
      });
      try {
        const report = await cleanupDeletedAccount(refs({ urls: uploads, keepUrls: [] }));
        // 1 story file + 2 folders + 12 club uploads.
        expect(report.imagekit).toEqual({ attempted: 15, failed: 0 });
        expect(maxInFlight).toBe(4);
      } finally {
        fetchMock.mockImplementation(defaultFetch);
      }
    });
  });

  it("skips the providers and the garmin-service that are not configured", async () => {
    const saved = { ...m.env };
    Object.assign(m.env, { imagekitPrivateKey: "", cloudinaryApiSecret: "", supabaseServiceRoleKey: "" });
    delete process.env.GARMIN_SERVICE_SECRET;
    try {
      const report = await cleanupDeletedAccount(refs());
      expect(fetchCalls).toHaveLength(0);
      expect(m.from).not.toHaveBeenCalled();
      expect(report).toMatchObject({
        imagekit: { attempted: 0 },
        cloudinary: { attempted: 0 },
        supabase: { attempted: 0 },
        garmin: "skipped",
      });
    } finally {
      Object.assign(m.env, saved);
    }
  });
});
