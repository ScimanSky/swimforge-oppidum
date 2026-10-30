import { beforeEach, describe, expect, it, vi } from "vitest";

// auth.exportMyData (older app builds) shares the per-user limit of GET /api/account/export.

const m = vi.hoisted(() => ({ consume: vi.fn(), exportUserData: vi.fn() }));

vi.mock("../lib/ai-rate-limit", () => ({ createUserRateLimit: () => ({ consume: m.consume }) }));
vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: { ...actual.db, exportUserData: m.exportUserData } };
});

import { NATIVE_DATA_EXPORT_MESSAGE } from "@shared/native";
import { authRouter } from "./auth.router";

const caller = (headers: Record<string, string> = {}) =>
  authRouter.createCaller({
    user: { id: 42, email: "ada@example.com" } as any,
    req: { protocol: "https", headers } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  });

describe("auth.exportMyData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.consume.mockResolvedValue(true);
    m.exportUserData.mockResolvedValue({ version: 2, data: {} });
  });

  it("returns the caller's export within the limit", async () => {
    await expect(caller().exportMyData()).resolves.toEqual({ version: 2, data: {} });
    expect(m.consume).toHaveBeenCalledWith(42);
    expect(m.exportUserData).toHaveBeenCalledWith(42);
  });

  it("refuses over the limit without reading the account", async () => {
    m.consume.mockResolvedValue(false);
    await expect(caller().exportMyData()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Troppe esportazioni. Riprova tra un'ora.",
    });
    expect(m.exportUserData).not.toHaveBeenCalled();
  });

  it("from the Android app (old builds call it): the website guidance, never an in-memory export", async () => {
    await expect(caller({ "x-swimforge-client": "native" }).exportMyData()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: NATIVE_DATA_EXPORT_MESSAGE,
    });
    expect(NATIVE_DATA_EXPORT_MESSAGE).toContain("Scarica i tuoi dati dal sito swimforge.it");
    expect(m.exportUserData).not.toHaveBeenCalled();
    expect(m.consume).not.toHaveBeenCalled();
  });
});

