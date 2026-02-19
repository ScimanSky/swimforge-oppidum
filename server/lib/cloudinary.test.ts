import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, warnMock } = vi.hoisted(() => ({
  envMock: {
    cloudinaryCloudName: "demo-cloud",
    cloudinaryApiKey: "demo-key",
    cloudinaryApiSecret: "demo-secret",
  },
  warnMock: vi.fn(),
}));

vi.mock("../_core/env", () => ({
  ENV: envMock,
}));

vi.mock("../middleware/logger", () => ({
  logger: {
    child: () => ({
      warn: warnMock,
    }),
  },
}));

import { getCloudinaryCreditUsage } from "./cloudinary";

beforeEach(() => {
  vi.clearAllMocks();
  envMock.cloudinaryCloudName = "demo-cloud";
  envMock.cloudinaryApiKey = "demo-key";
  envMock.cloudinaryApiSecret = "demo-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCloudinaryCreditUsage", () => {
  it("returns null when Cloudinary config is missing", async () => {
    envMock.cloudinaryApiSecret = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses credits usage/limit from primary payload shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ credits: { usage: 0.04, limit: 37 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();

    expect(result).toEqual({
      used: 0.04,
      limit: 37,
      percentUsed: 0.11,
    });
  });

  it("parses numeric strings from credit_usage shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ credit_usage: { used: "4", limit: "40" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();

    expect(result).toEqual({
      used: 4,
      limit: 40,
      percentUsed: 10,
    });
  });

  it("falls back to plan.credit_limit when credits.limit is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ credits: { used: 5 }, plan: { credit_limit: 50 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();
    expect(result).toEqual({
      used: 5,
      limit: 50,
      percentUsed: 10,
    });
  });

  it("returns null for non-positive limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ credits: { usage: 10, limit: 0 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();
    expect(result).toBeNull();
  });

  it("returns null and logs warning when Cloudinary API is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();

    expect(result).toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      "[Cloudinary] Failed to fetch usage",
      expect.objectContaining({
        event: "cloudinary:usage_failed",
        status: 429,
      })
    );
  });

  it("uses Basic auth header and the expected usage endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ credits: { usage: 1, limit: 100 } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getCloudinaryCreditUsage();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo-cloud/usage");
    expect(init.method).toBe("GET");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Basic ZGVtby1rZXk6ZGVtby1zZWNyZXQ=");
  });

  it("returns null and logs warning when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getCloudinaryCreditUsage();

    expect(result).toBeNull();
    expect(warnMock).toHaveBeenCalledWith(
      "[Cloudinary] Usage check error",
      expect.objectContaining({
        event: "cloudinary:usage_error",
      })
    );
  });
});
