import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  permission: "granted" as string,
  listeners: new Map<string, (data: unknown) => void>(),
  register: vi.fn(async () => ({ success: true })),
  unregister: vi.fn(async () => ({ success: true })),
  toast: vi.fn(),
}));

vi.mock("./platform", () => ({ isNativePlatform: () => mocks.native }));
vi.mock("./trpc-client", () => ({
  vanillaTrpc: { push: { register: { mutate: mocks.register }, unregister: { mutate: mocks.unregister } } },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    checkPermissions: vi.fn(async () => ({ receive: mocks.permission })),
    requestPermissions: vi.fn(async () => ({ receive: mocks.permission === "denied" ? "denied" : "granted" })),
    createChannel: vi.fn(async () => {}),
    removeAllListeners: vi.fn(async () => {}),
    addListener: vi.fn(async (event: string, cb: (data: unknown) => void) => {
      mocks.listeners.set(event, cb);
      return { remove: vi.fn(async () => {}) };
    }),
    register: vi.fn(async () => {}),
    unregister: vi.fn(async () => {}),
  },
}));

import { PushNotifications } from "@capacitor/push-notifications";
import {
  registerPushToken,
  resetPushStateForTests,
  resolvePushUrl,
  setPushNavigate,
  unregisterPushToken,
  unregisterPushTokenLocally,
} from "./push";

const TOKEN = "fcm-token-0123456789abcdef";
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const emit = async (event: string, data: unknown) => {
  mocks.listeners.get(event)?.(data);
  await flush();
};

describe("resolvePushUrl", () => {
  it("keeps in-app paths", () => {
    expect(resolvePushUrl({ url: "/post/7" })).toBe("/post/7");
    expect(resolvePushUrl({ url: "/messages?c=3#end" })).toBe("/messages?c=3#end");
  });
  it("falls back to /home for external or malformed urls", () => {
    expect(resolvePushUrl({ url: "//evil.com" })).toBe("/home");
    expect(resolvePushUrl({ url: "https://x.it/post/1" })).toBe("/home");
    expect(resolvePushUrl({ url: "javascript:alert(1)" })).toBe("/home");
    expect(resolvePushUrl({ url: "/\\evil.com" })).toBe("/home");
    expect(resolvePushUrl({ url: "/\t/evil.com" })).toBe("/home");
    expect(resolvePushUrl({ url: "post/1" })).toBe("/home");
  });
  it("falls back to /home when the url is missing", () => {
    expect(resolvePushUrl({})).toBe("/home");
    expect(resolvePushUrl({ url: 42 })).toBe("/home");
    expect(resolvePushUrl(undefined)).toBe("/home");
    expect(resolvePushUrl(null)).toBe("/home");
  });
});

describe("registerPushToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPushStateForTests();
    mocks.native = true;
    mocks.permission = "granted";
    mocks.listeners.clear();
  });

  it("registers with FCM and sends the token to push.register when permission is granted", async () => {
    await registerPushToken();
    expect(PushNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "default", importance: 4 }),
    );
    expect(PushNotifications.register).toHaveBeenCalledTimes(1);
    await emit("registration", { value: TOKEN });
    expect(mocks.register).toHaveBeenCalledWith({ token: TOKEN, platform: "android", appVersion: "dev" });
  });

  it("asks for the permission when it is still to be prompted", async () => {
    mocks.permission = "prompt";
    await registerPushToken();
    expect(PushNotifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(PushNotifications.register).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when the permission is denied", async () => {
    mocks.permission = "denied";
    await registerPushToken();
    expect(PushNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(PushNotifications.addListener).not.toHaveBeenCalled();
    expect(PushNotifications.register).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("shares one attempt between concurrent calls", async () => {
    await Promise.all([registerPushToken(), registerPushToken()]);
    expect(PushNotifications.checkPermissions).toHaveBeenCalledTimes(1);
    expect(PushNotifications.register).toHaveBeenCalledTimes(1);
  });

  it("does not keep a token that push.register rejected", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.register.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    await registerPushToken();
    await emit("registration", { value: TOKEN });
    await unregisterPushToken();
    expect(mocks.unregister).not.toHaveBeenCalled();
    expect(PushNotifications.unregister).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("adds the listeners once across calls", async () => {
    await registerPushToken();
    await registerPushToken();
    expect(PushNotifications.register).toHaveBeenCalledTimes(2);
    expect(PushNotifications.addListener).toHaveBeenCalledTimes(4);
    expect(PushNotifications.removeAllListeners).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on the web", async () => {
    mocks.native = false;
    await registerPushToken();
    await unregisterPushToken();
    expect(PushNotifications.checkPermissions).not.toHaveBeenCalled();
    expect(PushNotifications.unregister).not.toHaveBeenCalled();
  });

  it("never throws when the plugin fails", async () => {
    vi.mocked(PushNotifications.checkPermissions).mockRejectedValueOnce(new Error("no bridge"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registerPushToken()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("navigates to the notification url on tap and toasts in the foreground", async () => {
    const navigate = vi.fn();
    setPushNavigate(navigate);
    await registerPushToken();
    await emit("pushNotificationActionPerformed", {
      actionId: "tap",
      notification: { data: { url: "/post/9", tag: "post:9" } },
    });
    expect(navigate).toHaveBeenCalledWith("/post/9");
    await emit("pushNotificationActionPerformed", { actionId: "tap", notification: { data: { url: "https://x" } } });
    expect(navigate).toHaveBeenLastCalledWith("/home");
    // A direct message opens the chat with its sender.
    await emit("pushNotificationActionPerformed", {
      actionId: "tap",
      notification: { data: { url: "/messages?con=3", tag: "dm" } },
    });
    expect(navigate).toHaveBeenLastCalledWith("/messages?con=3");

    await emit("pushNotificationReceived", { title: "Nuovo like", body: "Ada ha messo like", data: { url: "/post/9" } });
    expect(mocks.toast).toHaveBeenCalledWith(
      "Nuovo like",
      expect.objectContaining({ description: "Ada ha messo like" }),
    );
  });
});

describe("unregisterPushToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPushStateForTests();
    mocks.native = true;
    mocks.permission = "granted";
    mocks.listeners.clear();
  });

  it("deletes the token on the device first, then on the server", async () => {
    await registerPushToken();
    await emit("registration", { value: TOKEN });
    await unregisterPushToken();
    expect(mocks.unregister).toHaveBeenCalledWith({ token: TOKEN });
    expect(PushNotifications.unregister).toHaveBeenCalledTimes(1);
    expect(vi.mocked(PushNotifications.unregister).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(mocks.unregister).mock.invocationCallOrder[0],
    );

    // The token is forgotten: a second logout only touches FCM.
    await unregisterPushToken();
    expect(mocks.unregister).toHaveBeenCalledTimes(1);
  });

  it("gives up on the server after 3 s", async () => {
    await registerPushToken();
    await emit("registration", { value: TOKEN });
    vi.useFakeTimers();
    try {
      mocks.unregister.mockImplementationOnce(() => new Promise(() => {}));
      let done = false;
      const pending = unregisterPushToken().then(() => {
        done = true;
      });
      await vi.advanceTimersByTimeAsync(2999);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(done).toBe(true);
      expect(PushNotifications.unregister).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer when the server answers in time", async () => {
    await registerPushToken();
    await emit("registration", { value: TOKEN });
    vi.useFakeTimers();
    try {
      await unregisterPushToken();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("locally: deletes the device token without calling the server, and forgets it", async () => {
    await registerPushToken();
    await emit("registration", { value: TOKEN });
    await unregisterPushTokenLocally();
    expect(PushNotifications.unregister).toHaveBeenCalledTimes(1);
    expect(mocks.unregister).not.toHaveBeenCalled();
    await unregisterPushToken();
    expect(mocks.unregister).not.toHaveBeenCalled();
  });

  it("skips the server without a token and ignores failures", async () => {
    vi.mocked(PushNotifications.unregister).mockRejectedValueOnce(new Error("boom"));
    await expect(unregisterPushToken()).resolves.toBeUndefined();
    expect(mocks.unregister).not.toHaveBeenCalled();

    await registerPushToken();
    await emit("registration", { value: TOKEN });
    mocks.unregister.mockRejectedValueOnce(new Error("offline"));
    await expect(unregisterPushToken()).resolves.toBeUndefined();
    expect(PushNotifications.unregister).toHaveBeenCalledTimes(2);
  });
});
