import { describe, expect, it } from "vitest";
import {
  buildDirectMessagePush,
  buildGarminSyncPush,
  buildNotificationPush,
  buildPersonalRecordPush,
} from "./push_messages";

describe("buildNotificationPush", () => {
  it("uses the Italian title per type and the notification message as body", () => {
    expect(
      buildNotificationPush({ type: "reaction", title: "x", message: "Ada ha reagito 🔥 al tuo post.", link: "/post/5", referenceId: 5 }),
    ).toEqual({ title: "Nuova reazione", body: "Ada ha reagito 🔥 al tuo post.", url: "/post/5" });
    expect(buildNotificationPush({ type: "comment", title: "x", message: "Ada: ciao", link: "/post/5" }).title).toBe("Nuovo commento");
    expect(buildNotificationPush({ type: "mention", title: "x", message: "m", link: "/post/5" }).title).toBe("Ti hanno menzionato");
    expect(
      buildNotificationPush({ type: "club_workout_published", title: "x", message: "m", link: "/community/club/3/workouts/9" }),
    ).toEqual({ title: "Nuovo allenamento del club", body: "m", url: "/community/club/3/workouts/9" });
    expect(buildNotificationPush({ type: "meet_published", title: "x", message: "m", link: "/community/club/3/meet/1" }).title).toBe(
      "Novità dal club",
    );
    expect(buildNotificationPush({ type: "club_ai_post", title: "x", message: "m" }).title).toBe("Novità dal club");
    expect(buildNotificationPush({ type: "follow", title: "Nuovo follower", message: "m", link: "/u/4" }).title).toBe("Nuovo follower");
  });

  it("derives the url when the link is missing or not an in-app path", () => {
    expect(buildNotificationPush({ type: "reaction", title: "t", message: "m", referenceId: 8 }).url).toBe("/post/8");
    expect(buildNotificationPush({ type: "comment", title: "t", message: "m", link: "https://evil.example/x", referenceId: 8 }).url).toBe(
      "/post/8",
    );
    expect(buildNotificationPush({ type: "follow", title: "t", message: "m", link: "//evil.example" }).url).toBe("/home");
    expect(buildNotificationPush({ type: "meet_published", title: "t", message: "m" }).url).toBe("/home");
  });

  it("falls back to a generic body when the message is empty", () => {
    expect(buildNotificationPush({ type: "follow", title: "Nuovo follower", message: "  " }).body).toBe("Nuovo follower");
  });
});

describe("buildDirectMessagePush", () => {
  it("uses the sender name as title and a 100 char preview as body", () => {
    const long = "a".repeat(150);
    const push = buildDirectMessagePush({ senderName: "Ada", content: long, messageType: "text" });
    expect(push.title).toBe("Ada");
    expect(push.body).toBe(`${"a".repeat(100)}…`);
    expect(push.url).toBe("/messages");
  });

  it("describes forwarded posts and falls back when the name is missing", () => {
    expect(buildDirectMessagePush({ senderName: null, content: "{}", messageType: "forward_post" })).toEqual({
      title: "Nuovo messaggio",
      body: "Ti ha inoltrato un post",
      url: "/messages",
      tag: "dm",
    });
  });
});

describe("buildGarminSyncPush", () => {
  it("handles singular and plural", () => {
    expect(buildGarminSyncPush(1)).toEqual({
      title: "Sincronizzazione Garmin completata",
      body: "1 nuova attività importata",
      url: "/track",
      tag: "garmin-sync",
    });
    expect(buildGarminSyncPush(3).body).toBe("3 nuove attività importate");
  });
});

describe("buildPersonalRecordPush", () => {
  it("formats stroke, distance and time", () => {
    expect(buildPersonalRecordPush([{ strokeType: "freestyle", distanceMeters: 100, newTimeCs: 6532 }])).toEqual({
      title: "Nuovo record personale!",
      body: "Stile libero 100m in 1:05.32",
      url: "/profile",
      tag: "garmin-pb",
    });
    expect(buildPersonalRecordPush([{ strokeType: "butterfly", distanceMeters: 50, newTimeCs: 3207 }]).body).toBe("Delfino 50m in 32.07");
  });

  it("summarises several records", () => {
    expect(
      buildPersonalRecordPush([
        { strokeType: "backstroke", distanceMeters: 200, newTimeCs: 15000 },
        { strokeType: "freestyle", distanceMeters: 50, newTimeCs: 3000 },
        { strokeType: "freestyle", distanceMeters: 100, newTimeCs: 6600 },
      ])?.body,
    ).toBe("Dorso 200m in 2:30.00 e altri 2 record");
  });

  it("returns null without records", () => {
    expect(buildPersonalRecordPush([])).toBeNull();
  });
});
