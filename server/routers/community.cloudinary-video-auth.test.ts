import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { envMock, getCloudinaryCreditUsageMock, getClubMemberRoleMock } = vi.hoisted(() => ({
  envMock: {
    cloudinaryCloudName: "demo-cloud",
    cloudinaryApiKey: "demo-key",
    cloudinaryApiSecret: "demo-secret",
    cloudinaryVideoCreditWarnPercent: 80,
    cloudinaryVideoCreditBlockPercent: 95,
  },
  getCloudinaryCreditUsageMock: vi.fn(),
  getClubMemberRoleMock: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: envMock,
}));

vi.mock("../lib/cloudinary", () => ({
  getCloudinaryCreditUsage: getCloudinaryCreditUsageMock,
}));

vi.mock("../db_clubs", () => ({
  getClubMemberRole: getClubMemberRoleMock,
}));

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "cloudinary-auth-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function expectedSignature(folder: string, timestamp: number, secret: string) {
  const payload = `folder=${folder}&timestamp=${timestamp}`;
  return createHash("sha1").update(`${payload}${secret}`).digest("hex");
}

describe("community.cloudinaryVideoAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-19T12:00:00.000Z"));

    envMock.cloudinaryCloudName = "demo-cloud";
    envMock.cloudinaryApiKey = "demo-key";
    envMock.cloudinaryApiSecret = "demo-secret";
    envMock.cloudinaryVideoCreditWarnPercent = 80;
    envMock.cloudinaryVideoCreditBlockPercent = 95;

    getCloudinaryCreditUsageMock.mockResolvedValue(null);
    getClubMemberRoleMock.mockResolvedValue({ role: "owner", status: "active" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects when Cloudinary configuration is missing", async () => {
    envMock.cloudinaryApiSecret = "";
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.cloudinaryVideoAuth()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Cloudinary non configurato sul server.",
    });
  });

  it("returns signed auth for default posts scope", async () => {
    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.cloudinaryVideoAuth();
    const timestamp = Math.floor(new Date("2026-02-19T12:00:00.000Z").getTime() / 1000);

    expect(result).toMatchObject({
      cloudName: "demo-cloud",
      apiKey: "demo-key",
      folder: "posts/42",
      timestamp,
      warning: null,
      creditUsage: null,
    });
    expect(result.signature).toBe(expectedSignature("posts/42", timestamp, "demo-secret"));
  });

  it("uses stories folder when stories scope is requested", async () => {
    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.cloudinaryVideoAuth({ scope: "stories" });

    expect(result.folder).toBe("stories/42");
  });

  it("rejects clubs scope when clubId is missing", async () => {
    const caller = communityRouter.createCaller(createAuthContext());
    await expect(
      caller.cloudinaryVideoAuth({ scope: "clubs" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "clubId richiesto per upload video del club.",
    });
  });

  it("rejects clubs scope for non-staff members", async () => {
    getClubMemberRoleMock.mockResolvedValue({ role: "member", status: "active" });
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(
      caller.cloudinaryVideoAuth({ scope: "clubs", clubId: 777 })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("returns clubs folder for staff role", async () => {
    getClubMemberRoleMock.mockResolvedValue({ role: "admin", status: "active" });
    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.cloudinaryVideoAuth({ scope: "clubs", clubId: 777 });

    expect(result.folder).toBe("clubs/777/42");
  });

  it("blocks uploads when Cloudinary credit usage exceeds block threshold", async () => {
    getCloudinaryCreditUsageMock.mockResolvedValue({
      used: 96,
      limit: 100,
      percentUsed: 96,
    });
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.cloudinaryVideoAuth({ scope: "stories" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("returns warning when usage is above warn threshold but below block threshold", async () => {
    getCloudinaryCreditUsageMock.mockResolvedValue({
      used: 81,
      limit: 100,
      percentUsed: 81,
    });
    const caller = communityRouter.createCaller(createAuthContext());
    const result = await caller.cloudinaryVideoAuth({ scope: "stories" });

    expect(result.warning).toContain("Attenzione: quota Cloudinary al 81.0%");
    expect(result.creditUsage).toEqual({
      used: 81,
      limit: 100,
      percentUsed: 81,
    });
  });

  it("cloudinaryVideoUsage returns thresholds and flags", async () => {
    getCloudinaryCreditUsageMock.mockResolvedValue({
      used: 96,
      limit: 100,
      percentUsed: 96,
    });
    const caller = communityRouter.createCaller(createAuthContext());

    const result = await caller.cloudinaryVideoUsage();

    expect(result).toEqual({
      used: 96,
      limit: 100,
      percentUsed: 96,
      warnThreshold: 80,
      blockThreshold: 95,
      isWarning: true,
      isBlocked: true,
    });
  });

  it("cloudinaryVideoUsage returns null when usage cannot be fetched", async () => {
    getCloudinaryCreditUsageMock.mockResolvedValue(null);
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(caller.cloudinaryVideoUsage()).resolves.toBeNull();
  });
});
