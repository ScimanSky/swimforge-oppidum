import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { transferClubOwnershipMock } = vi.hoisted(() => ({ transferClubOwnershipMock: vi.fn() }));

vi.mock("../db_clubs", () => ({ transferClubOwnership: transferClubOwnershipMock }));

import { communityRouter } from "./community.router";

const caller = () =>
  communityRouter.createCaller({
    user: { id: 9, openId: "u", email: "a@b.it", name: "A", loginMethod: "google", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });

describe("community.clubs.transferOwnership", () => {
  beforeEach(() => {
    transferClubOwnershipMock.mockReset();
  });

  it("transfers the caller's club to the chosen member", async () => {
    transferClubOwnershipMock.mockResolvedValue({ transferred: true, clubId: 3, ownerId: 12 });
    await expect(caller().clubs.transferOwnership({ clubId: 3, newOwnerId: 12 })).resolves.toEqual({
      transferred: true,
      clubId: 3,
      ownerId: 12,
    });
    expect(transferClubOwnershipMock).toHaveBeenCalledWith(9, 3, 12);
  });

  it.each([
    ["Forbidden", "FORBIDDEN", "Solo il proprietario può trasferire il club."],
    ["Club not found", "NOT_FOUND", "Club non trovato."],
    ["Target not an active member", "BAD_REQUEST", "Il nuovo proprietario deve essere un membro attivo del club."],
  ])("answers «%s» as %s in Italian", async (error, code, message) => {
    transferClubOwnershipMock.mockRejectedValue(new Error(error));
    await expect(caller().clubs.transferOwnership({ clubId: 3, newOwnerId: 12 })).rejects.toMatchObject({ code, message });
  });
});
