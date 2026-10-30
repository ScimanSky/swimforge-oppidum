import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Accounts and sessions exist only after Termini, Privacy and the age are accepted, through a
// Supabase identity: the legacy paths (local password registration and login, the Manus OAuth
// callback and the OAuth upsert inside authenticateRequest) are gone.

const m = vi.hoisted(() => {
  const previousEnv = {
    JWT_SECRET: process.env.JWT_SECRET,
    VITE_APP_ID: process.env.VITE_APP_ID,
    OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL,
  };
  process.env.JWT_SECRET = "test-secret-for-legacy-auth-0123456789";
  process.env.VITE_APP_ID = "test-app";
  // Even with an OAuth server configured, nobody is created on the fly.
  process.env.OAUTH_SERVER_URL = "https://oauth.example.com";
  return { previousEnv, getUserById: vi.fn(), getUserByOpenId: vi.fn(), upsertUser: vi.fn(), post: vi.fn() };
});

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getUserById: m.getUserById, getUserByOpenId: m.getUserByOpenId, upsertUser: m.upsertUser };
});
vi.mock("axios", () => ({ default: { create: () => ({ post: m.post }) } }));

import type { Request } from "express";
import { sdk } from "./_core/sdk";
import { authRouter } from "./routers/auth.router";

afterAll(() => {
  for (const [key, value] of Object.entries(m.previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const root = path.resolve(import.meta.dirname, "..");

describe("legacy auth paths", () => {
  it("has no local password login and no local registration", () => {
    const procedures = Object.keys(authRouter._def.procedures);
    expect(procedures).not.toContain("login");
    // auth.register created a password account for any email, unverified (account pre-hijack).
    expect(procedures).not.toContain("register");
    expect(procedures).toContain("syncSupabaseUser");
  });

  it("serves no OAuth callback", () => {
    expect(fs.existsSync(path.join(root, "server/_core/oauth.ts"))).toBe(false);
    const index = fs.readFileSync(path.join(root, "server/_core/index.ts"), "utf8");
    expect(index).not.toContain("/api/oauth");
    expect(index).not.toContain("registerOAuthRoutes");
  });

  it("never creates a user while authenticating a session of an unknown user", async () => {
    m.getUserById.mockResolvedValue(undefined);
    m.getUserByOpenId.mockResolvedValue(undefined);
    m.post.mockResolvedValue({ data: { openId: "manus-1", name: "X", email: "x@example.com" } });
    const token = await sdk.createSessionToken("manus-1", { tokenVersion: 1 });
    await expect(sdk.authenticateRequest({ headers: { authorization: `Bearer ${token}` } } as unknown as Request)).rejects.toThrow(
      "User not found",
    );
    expect(m.upsertUser).not.toHaveBeenCalled();
    expect(m.post).not.toHaveBeenCalled();
  });
});
