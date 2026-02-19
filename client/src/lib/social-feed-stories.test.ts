import { describe, expect, it } from "vitest";
import { buildDisplayStoryGroups, findStoryGroupIndex, sortStoryGroupsForHeader, type SocialStoryGroup } from "./social-feed-stories";

function group(userId: number, viewedFlags: boolean[], name?: string): SocialStoryGroup {
  return {
    userId,
    userName: name ?? `User ${userId}`,
    userAvatar: null,
    stories: viewedFlags.map((hasViewed) => ({ hasViewed })),
  };
}

describe("social-feed-stories helpers", () => {
  it("sorts groups with unviewed stories first", () => {
    const sorted = sortStoryGroupsForHeader([
      group(1, [true, true]),
      group(2, [false, true]),
      group(3, [true]),
    ]);

    expect(sorted.map((item) => item.userId)).toEqual([2, 1, 3]);
  });

  it("builds display list with current user first when already present", () => {
    const result = buildDisplayStoryGroups({
      allGroups: [group(9, [true]), group(1, [true])],
      currentUserId: 1,
      displayName: "Me",
      avatarUrl: "https://cdn.example.com/me.jpg",
    });

    expect(result.map((item) => item.userId)).toEqual([1, 9]);
  });

  it("inserts placeholder current user group when not present", () => {
    const result = buildDisplayStoryGroups({
      allGroups: [group(9, [true]), group(10, [true, true])],
      currentUserId: 1,
      displayName: "Fabrizio",
      avatarUrl: "https://cdn.example.com/me.jpg",
    });

    expect(result[0]).toEqual({
      userId: 1,
      userName: "Fabrizio",
      userAvatar: "https://cdn.example.com/me.jpg",
      stories: [],
    });
    expect(result.slice(1).map((item) => item.userId)).toEqual([9, 10]);
  });

  it("returns only sorted others when current user is not available", () => {
    const result = buildDisplayStoryGroups({
      allGroups: [group(2, [true]), group(3, [false])],
      currentUserId: null,
      displayName: "ignored",
      avatarUrl: null,
    });

    expect(result.map((item) => item.userId)).toEqual([3, 2]);
  });

  it("finds the correct viewer index on displayed groups", () => {
    const groups = buildDisplayStoryGroups({
      allGroups: [group(10, [true]), group(11, [false]), group(1, [true])],
      currentUserId: 1,
      displayName: "Me",
      avatarUrl: null,
    });

    expect(findStoryGroupIndex(groups, 1)).toBe(0);
    expect(findStoryGroupIndex(groups, 11)).toBe(1);
    expect(findStoryGroupIndex(groups, 999)).toBe(-1);
  });
});
