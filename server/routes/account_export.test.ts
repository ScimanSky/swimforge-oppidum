import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/account/export: the caller's own data only, as a streamed JSON download.

const m = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  consume: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: m.authenticateRequest } }));
vi.mock("../lib/ai-rate-limit", () => ({ createUserRateLimit: () => ({ consume: m.consume }) }));
vi.mock("../db", () => ({ getDb: async () => ({ execute: m.execute }) }));

import { accountExportRouter } from "./account_export";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(accountExportRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  m.authenticateRequest.mockRejectedValue(new Error("Invalid session cookie"));
  m.consume.mockResolvedValue(true);
  m.execute.mockImplementation(async (query: any) => {
    const text = query.queryChunks.map((chunk: any) => (Array.isArray(chunk?.value) ? chunk.value.join("") : "")).join("");
    if (text.includes("FROM users")) return { rows: [{ id: 42, email: "ada@example.com" }] };
    return { rows: [] };
  });
});

describe("GET /api/account/export", () => {
  it("refuses a caller without a session", async () => {
    const response = await fetch(`${baseUrl}/api/account/export`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Accedi per esportare i tuoi dati." });
    expect(m.execute).not.toHaveBeenCalled();
  });

  it("streams the caller's own export as a JSON attachment", async () => {
    m.authenticateRequest.mockResolvedValue({ id: 42 });
    const response = await fetch(`${baseUrl}/api/account/export`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="swimforge-dati-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ version: 2, user: { id: 42 } });
    expect(body.data.laps).toEqual([]);
    expect(m.consume).toHaveBeenCalledWith(42);
  });

  it("limits the downloads per user", async () => {
    m.authenticateRequest.mockResolvedValue({ id: 42 });
    m.consume.mockResolvedValue(false);
    const response = await fetch(`${baseUrl}/api/account/export`);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Troppe esportazioni. Riprova tra un'ora." });
  });

  it("answers an error, not half a file, when the database fails first", async () => {
    m.authenticateRequest.mockResolvedValue({ id: 42 });
    m.execute.mockRejectedValue(new Error("connection refused"));
    const response = await fetch(`${baseUrl}/api/account/export`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Esportazione non riuscita, riprova più tardi." });
  });
});
