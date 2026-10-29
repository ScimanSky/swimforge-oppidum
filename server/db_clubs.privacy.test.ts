import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: async () => null }));

import { clubPrivacy } from "./db_clubs";

// clubs.get hides a club from non-members only when is_private is set, so every
// club that is not public must be stored as private, as updateClub already does.
describe("clubPrivacy", () => {
  it("stores invite-only clubs as private", () => {
    expect(clubPrivacy({ visibility: "invite", isPrivate: false })).toEqual({
      visibility: "invite",
      isPrivate: true,
    });
  });

  it("stores private clubs as private", () => {
    expect(clubPrivacy({ visibility: "private" })).toEqual({ visibility: "private", isPrivate: true });
  });

  it("keeps public clubs public", () => {
    expect(clubPrivacy({ visibility: "public" })).toEqual({ visibility: "public", isPrivate: false });
  });

  it("derives the visibility from isPrivate when it is missing", () => {
    expect(clubPrivacy({ isPrivate: true })).toEqual({ visibility: "private", isPrivate: true });
    expect(clubPrivacy({})).toEqual({ visibility: "public", isPrivate: false });
  });
});
