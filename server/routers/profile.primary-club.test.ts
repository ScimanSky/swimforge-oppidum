import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// «Club principale» in Modifica profilo: one of the user's active clubs, or «Nessuno» (null),
// saved as preferences.primaryClubId with the same atomic merge as cssTest and paceZones.

const m = vi.hoisted(() => ({
  mergeSwimmerPreferences: vi.fn(async () => true),
  getClubMemberRole: vi.fn(),
}));

vi.mock("../lib/preferences", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/preferences")>()),
  mergeSwimmerPreferences: m.mergeSwimmerPreferences,
}));
vi.mock("../db_clubs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db_clubs")>()),
  getClubMemberRole: m.getClubMemberRole,
}));

import { profileRouter } from "./profile.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "primary-club",
      email: "me@example.com",
      name: "Me",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const caller = () => profileRouter.createCaller(ctx());

beforeEach(() => {
  vi.clearAllMocks();
  m.mergeSwimmerPreferences.mockResolvedValue(true);
});

describe("profile.setPrimaryClub", () => {
  it("saves a club the user is an active member of", async () => {
    m.getClubMemberRole.mockResolvedValue({ role: "member", status: "active" });
    await expect(caller().setPrimaryClub({ clubId: 3 })).resolves.toEqual({ primaryClubId: 3 });
    expect(m.getClubMemberRole).toHaveBeenCalledWith(42, 3);
    expect(m.mergeSwimmerPreferences).toHaveBeenCalledWith(42, { primaryClubId: 3 });
  });

  it("«Nessuno» stores an explicit null: no club next to the name", async () => {
    await expect(caller().setPrimaryClub({ clubId: null })).resolves.toEqual({ primaryClubId: null });
    expect(m.getClubMemberRole).not.toHaveBeenCalled();
    expect(m.mergeSwimmerPreferences).toHaveBeenCalledWith(42, { primaryClubId: null });
  });

  it("refuses a club the user is not an active member of", async () => {
    for (const membership of [null, { role: "member", status: "pending" }, { role: "member", status: "banned" }]) {
      m.getClubMemberRole.mockResolvedValue(membership);
      await expect(caller().setPrimaryClub({ clubId: 9 })).rejects.toThrow(
        "Puoi scegliere solo un club di cui fai parte.",
      );
    }
    expect(m.mergeSwimmerPreferences).not.toHaveBeenCalled();
  });

  it("no profile yet: «Profilo non trovato»", async () => {
    m.mergeSwimmerPreferences.mockResolvedValue(false);
    await expect(caller().setPrimaryClub({ clubId: null })).rejects.toThrow("Profilo non trovato");
  });
});
