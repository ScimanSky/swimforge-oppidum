import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/redis-rate-limit-store", () => ({ createRedisStore: () => undefined }));

import { corsOptions, helmetConfig } from "./security";

describe("helmetConfig", () => {
  it("lets same-site pages (the app origin) embed static resources", () => {
    expect(helmetConfig.crossOriginResourcePolicy).toEqual({ policy: "same-site" });
  });
});

describe("corsOptions.origin", () => {
  const run = (origin: string | undefined) =>
    new Promise<{ err: Error | null; allow?: boolean }>((resolve) => {
      (corsOptions.origin as any)(origin, (err: Error | null, allow?: boolean) => resolve({ err, allow }));
    });

  it("allows the app origin", async () => {
    await expect(run("https://app.swimforge.it")).resolves.toEqual({ err: null, allow: true });
  });

  it("does not raise an error for a disallowed origin", async () => {
    await expect(run("https://evil.example")).resolves.toEqual({ err: null, allow: false });
  });
});
