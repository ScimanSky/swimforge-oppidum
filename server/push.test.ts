import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return {
    env: { firebaseServiceAccountJson: "" },
    log,
    initializeApp: vi.fn((_options: unknown, name: string) => ({ name })),
    cert: vi.fn((serviceAccount: unknown) => ({ serviceAccount })),
    getApps: vi.fn((): Array<{ name: string }> => []),
    sendEachForMulticast: vi.fn(),
    listUserDeviceTokens: vi.fn(),
    deleteTokens: vi.fn(),
    getUserNotificationSettings: vi.fn(),
  };
});

vi.mock("firebase-admin/app", () => ({
  initializeApp: h.initializeApp,
  cert: h.cert,
  getApps: h.getApps,
}));
vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({ sendEachForMulticast: h.sendEachForMulticast }),
}));
vi.mock("./_core/env", () => ({ ENV: h.env }));
vi.mock("./middleware/logger", () => ({ logger: { child: () => h.log } }));
vi.mock("./db_device_tokens", () => ({
  listUserDeviceTokens: h.listUserDeviceTokens,
  deleteTokens: h.deleteTokens,
  getUserNotificationSettings: h.getUserNotificationSettings,
}));

import { initPush, resetPushForTests, sendPushToUser } from "./push";

const serviceAccount = { project_id: "swimforge-oppidum", client_email: "fcm@example.iam", private_key: "KEY" };
const encoded = Buffer.from(JSON.stringify(serviceAccount)).toString("base64");
const payload = { title: "Nuovo commento", body: "Ada: bello!", url: "/post/7" };

describe("push", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPushForTests();
    h.env.firebaseServiceAccountJson = encoded;
    h.getApps.mockReturnValue([]);
    h.listUserDeviceTokens.mockResolvedValue(["tok-a", "tok-b"]);
    h.getUserNotificationSettings.mockResolvedValue(null);
    h.deleteTokens.mockResolvedValue(undefined);
    h.sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });
  });

  it("is a no-op with a single warning when the service account is not configured", async () => {
    h.env.firebaseServiceAccountJson = "";
    expect(initPush()).toBe(false);
    await expect(sendPushToUser(1, payload)).resolves.toEqual({ sent: 0, failed: 0 });
    await sendPushToUser(1, payload);
    expect(h.listUserDeviceTokens).not.toHaveBeenCalled();
    expect(h.sendEachForMulticast).not.toHaveBeenCalled();
    expect(h.initializeApp).not.toHaveBeenCalled();
    expect(h.log.warn).toHaveBeenCalledTimes(1);
  });

  it("disables push without throwing when the service account is malformed", async () => {
    h.env.firebaseServiceAccountJson = "not-base64-json";
    expect(initPush()).toBe(false);
    await expect(sendPushToUser(1, payload)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(h.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("initialises firebase once from the base64 service account", async () => {
    expect(initPush()).toBe(true);
    expect(initPush()).toBe(true);
    await sendPushToUser(1, payload);
    expect(h.initializeApp).toHaveBeenCalledTimes(1);
    expect(h.cert).toHaveBeenCalledWith(expect.objectContaining({ project_id: "swimforge-oppidum" }));
  });

  it("sends a multicast to the user's tokens with the url in data", async () => {
    await expect(sendPushToUser(42, { ...payload, tag: "comment" })).resolves.toEqual({ sent: 2, failed: 0 });
    expect(h.listUserDeviceTokens).toHaveBeenCalledWith(42);
    expect(h.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ["tok-a", "tok-b"],
      notification: { title: "Nuovo commento", body: "Ada: bello!" },
      data: { url: "/post/7", tag: "comment" },
      android: { priority: "high", notification: { channelId: "default", tag: "comment" } },
    });
  });

  it("skips the send when the user has no device", async () => {
    h.listUserDeviceTokens.mockResolvedValue([]);
    await expect(sendPushToUser(42, payload)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(h.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("deletes tokens that FCM reports as unregistered or invalid", async () => {
    h.listUserDeviceTokens.mockResolvedValue(["ok", "gone", "bad", "flaky"]);
    h.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 3,
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: false, error: { code: "messaging/invalid-registration-token" } },
        { success: false, error: { code: "messaging/internal-error" } },
      ],
    });
    await expect(sendPushToUser(42, payload)).resolves.toEqual({ sent: 1, failed: 3 });
    expect(h.deleteTokens).toHaveBeenCalledWith(["gone", "bad"]);
  });

  it("swallows send errors and reports them as failures", async () => {
    h.sendEachForMulticast.mockRejectedValue(new Error("fcm down"));
    await expect(sendPushToUser(42, payload)).resolves.toEqual({ sent: 0, failed: 2 });
    expect(h.deleteTokens).not.toHaveBeenCalled();
    expect(h.log.warn).toHaveBeenCalled();
  });

  it("swallows database errors", async () => {
    h.listUserDeviceTokens.mockRejectedValue(new Error("db down"));
    await expect(sendPushToUser(42, payload)).resolves.toEqual({ sent: 0, failed: 0 });
  });

  it("respects the in-app notifications switch of the profile", async () => {
    h.getUserNotificationSettings.mockResolvedValue({ in_app_notifications: false });
    await expect(sendPushToUser(42, payload)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(h.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("respects an extra setting key when one is given", async () => {
    h.getUserNotificationSettings.mockResolvedValue({ in_app_notifications: true, activity_sync: "false" });
    await sendPushToUser(42, payload, { settingKey: "activity_sync" });
    expect(h.sendEachForMulticast).not.toHaveBeenCalled();
    await sendPushToUser(42, payload);
    expect(h.sendEachForMulticast).toHaveBeenCalledTimes(1);
  });
});
