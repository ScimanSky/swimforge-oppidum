import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

// ENV is read at module load, so the secret must be set before sdk.ts is imported.
const m = vi.hoisted(() => {
  const previousEnv = { JWT_SECRET: process.env.JWT_SECRET, VITE_APP_ID: process.env.VITE_APP_ID };
  process.env.JWT_SECRET = "test-secret-for-bearer-auth-0123456789";
  process.env.VITE_APP_ID = "test-app";
  return {
    previousEnv,
    getUserById: vi.fn(),
    getUserByOpenId: vi.fn(),
  };
});

vi.mock("../db", () => ({
  getUserById: m.getUserById,
  getUserByOpenId: m.getUserByOpenId,
}));

import { COOKIE_NAME } from "@shared/const";
import { sdk } from "./sdk";

function req(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

afterAll(() => {
  for (const [key, value] of Object.entries(m.previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("sdk.authenticateRequest bearer precedence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getUserById.mockResolvedValue({ id: 7, email: "u@b.it", name: "U", sessionTokenVersion: 1 });
    m.getUserByOpenId.mockResolvedValue(undefined);
  });

  it("rejects an invalid bearer even when the session cookie is valid (no cookie fallback)", async () => {
    const validToken = await sdk.createSessionToken("7", { tokenVersion: 1 });
    await expect(
      sdk.authenticateRequest(req({ authorization: "Bearer not-a-jwt", cookie: `${COOKIE_NAME}=${validToken}` }))
    ).rejects.toThrow("Invalid bearer session");
    // Sanity check: the same cookie alone is accepted.
    await expect(sdk.authenticateRequest(req({ cookie: `${COOKIE_NAME}=${validToken}` }))).resolves.toMatchObject({ id: 7 });
  });

  it("authenticates a valid bearer without any cookie", async () => {
    const token = await sdk.createSessionToken("7", { tokenVersion: 1 });
    await expect(sdk.authenticateRequest(req({ authorization: `Bearer ${token}` }))).resolves.toMatchObject({ id: 7 });
  });

  it("rejects a bearer whose token version was revoked", async () => {
    m.getUserById.mockResolvedValue({ id: 7, email: "u@b.it", name: "U", sessionTokenVersion: 2 });
    const token = await sdk.createSessionToken("7", { tokenVersion: 1 });
    await expect(sdk.authenticateRequest(req({ authorization: `Bearer ${token}` }))).rejects.toThrow("Session revoked");
  });
});
