import { describe, expect, it } from "vitest";
import { getNewestSyncedActivity, getSyncPromptDecision } from "./sync-share-prompt";

describe("sync-share-prompt helpers", () => {
  it("returns null when there are no synced garmin/strava activities", () => {
    const newest = getNewestSyncedActivity([
      { id: 1, activitySource: "manual", shareToFeed: false },
      { id: 2, activitySource: null, shareToFeed: false },
    ]);

    expect(newest).toBeNull();
  });

  it("returns highest id among synced activities", () => {
    const newest = getNewestSyncedActivity([
      { id: 10, activitySource: "garmin", shareToFeed: false },
      { id: 12, activitySource: "strava", shareToFeed: true },
      { id: 11, activitySource: "garmin", shareToFeed: false },
    ]);

    expect(newest).toMatchObject({ id: 12, activitySource: "strava" });
  });

  it("returns initialize action on first seen cycle", () => {
    const decision = getSyncPromptDecision({
      activities: [{ id: 25, activitySource: "garmin", shareToFeed: false }],
      lastSeenRaw: null,
    });

    expect(decision).toEqual({ action: "initialize", seenId: 25 });
  });

  it("returns prompt action when new synced activity is not shared", () => {
    const decision = getSyncPromptDecision({
      activities: [{ id: 30, activitySource: "garmin", shareToFeed: false }],
      lastSeenRaw: "20",
    });

    expect(decision).toEqual({
      action: "prompt",
      activity: { id: 30, activitySource: "garmin", shareToFeed: false },
    });
  });

  it("returns mark_seen action when new synced activity is already shared", () => {
    const decision = getSyncPromptDecision({
      activities: [{ id: 40, activitySource: "strava", shareToFeed: true }],
      lastSeenRaw: "39",
    });

    expect(decision).toEqual({ action: "mark_seen", seenId: 40 });
  });

  it("returns none when newest synced activity is not newer than seen id", () => {
    const decision = getSyncPromptDecision({
      activities: [{ id: 40, activitySource: "strava", shareToFeed: false }],
      lastSeenRaw: "40",
    });

    expect(decision).toEqual({ action: "none" });
  });
});
