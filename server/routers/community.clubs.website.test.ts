import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { createClubMock, updateClubMock } = vi.hoisted(() => ({
  createClubMock: vi.fn(),
  updateClubMock: vi.fn(),
}));

vi.mock("../db_clubs", () => ({
  createClub: createClubMock,
  updateClub: updateClubMock,
}));

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "test-user",
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

describe("community.clubs websiteUrl normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClubMock.mockResolvedValue(999);
    updateClubMock.mockResolvedValue({ success: true });
  });

  it("normalizes websiteUrl on clubs.create when protocol is missing", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.clubs.create({
      name: "Club Test",
      description: "desc",
      websiteUrl: "example.com",
      visibility: "public",
    });

    expect(createClubMock).toHaveBeenCalledTimes(1);
    expect(createClubMock).toHaveBeenCalledWith(42, expect.objectContaining({
      name: "Club Test",
      websiteUrl: "https://example.com/",
      visibility: "public",
    }));
  });

  it("sets websiteUrl to null on clubs.create for blank values", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.clubs.create({
      name: "Club Blank",
      websiteUrl: "   ",
    });

    expect(createClubMock).toHaveBeenCalledTimes(1);
    expect(createClubMock).toHaveBeenCalledWith(42, expect.objectContaining({
      websiteUrl: null,
    }));
  });

  it("rejects invalid websiteUrl on clubs.create", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(
      caller.clubs.create({
        name: "Club Bad",
        websiteUrl: "http://",
      })
    ).rejects.toMatchObject({
      message: "URL sito club non valido.",
    });
    expect(createClubMock).not.toHaveBeenCalled();
  });

  it("rejects invalid coverImageUrl on clubs.create", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(
      caller.clubs.create({
        name: "Club Cover Bad",
        coverImageUrl: "ftp://example.com/image.png",
      })
    ).rejects.toMatchObject({
      message: "Invalid cover image URL",
    });
    expect(createClubMock).not.toHaveBeenCalled();
  });

  it("normalizes websiteUrl on clubs.update when protocol is missing", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.clubs.update({
      clubId: 12,
      websiteUrl: "myswimclub.org/page",
    });

    expect(updateClubMock).toHaveBeenCalledTimes(1);
    expect(updateClubMock).toHaveBeenCalledWith(42, 12, expect.objectContaining({
      websiteUrl: "https://myswimclub.org/page",
    }));
  });

  it("passes websiteUrl null on clubs.update when explicitly blank", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.clubs.update({
      clubId: 12,
      websiteUrl: "",
    });

    expect(updateClubMock).toHaveBeenCalledTimes(1);
    expect(updateClubMock).toHaveBeenCalledWith(42, 12, expect.objectContaining({
      websiteUrl: null,
    }));
  });

  it("keeps websiteUrl undefined on clubs.update when omitted", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.clubs.update({
      clubId: 88,
      description: "new description",
    });

    expect(updateClubMock).toHaveBeenCalledTimes(1);
    expect(updateClubMock).toHaveBeenCalledWith(42, 88, expect.objectContaining({
      websiteUrl: undefined,
      description: "new description",
    }));
  });

  it("rejects invalid websiteUrl on clubs.update", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await expect(
      caller.clubs.update({
        clubId: 91,
        websiteUrl: "://bad-url",
      })
    ).rejects.toMatchObject({
      message: "URL sito club non valido.",
    });
    expect(updateClubMock).not.toHaveBeenCalled();
  });
});

