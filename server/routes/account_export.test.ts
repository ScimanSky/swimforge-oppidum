import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/account/export: the caller's own data only, as a streamed JSON download.

const m = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  consume: vi.fn(),
  execute: vi.fn(),
  events: [] as string[],
}));

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: m.authenticateRequest } }));
vi.mock("../middleware/logger", () => {
  const record = (_message: string, meta?: { event?: string }) => {
    if (meta?.event) m.events.push(meta.event);
  };
  const log = { info: record, warn: record, error: record, debug: record };
  return { logger: { ...log, child: () => log } };
});
vi.mock("../lib/ai-rate-limit", () => ({ createUserRateLimit: () => ({ consume: m.consume }) }));
vi.mock("../db", () => ({ getDb: async () => ({ execute: m.execute }) }));

import { EventEmitter } from "node:events";
import { accountExportRouter, writeExportChunk } from "./account_export";

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
  m.events.length = 0;
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

describe("export after the client is gone", () => {
  /** A response whose socket buffer is always full. */
  function fullResponse(state: { destroyed?: boolean; writableEnded?: boolean } = {}) {
    const res = Object.assign(new EventEmitter(), {
      destroyed: state.destroyed ?? false,
      writableEnded: state.writableEnded ?? false,
      write: vi.fn(() => false),
    });
    return res;
  }

  it("refuses to write, without waiting, when the response is already destroyed", async () => {
    const res = fullResponse({ destroyed: true });
    await expect(writeExportChunk(res as any, "x")).rejects.toThrow("Client closed the connection");
    expect(res.write).not.toHaveBeenCalled();
  });

  it("refuses to write when the response has already ended", async () => {
    const res = fullResponse({ writableEnded: true });
    await expect(writeExportChunk(res as any, "x")).rejects.toThrow("Client closed the connection");
  });

  it("does not wait for a drain when the write destroyed the response", async () => {
    const res = fullResponse();
    res.write.mockImplementation(() => {
      res.destroyed = true;
      return false;
    });
    await expect(writeExportChunk(res as any, "x")).rejects.toThrow("Client closed the connection");
  });

  it("settles when the client closes while waiting for the drain", async () => {
    const res = fullResponse();
    const pending = writeExportChunk(res as any, "x");
    res.emit("close");
    await expect(pending).rejects.toThrow("Client closed the connection");
    expect(res.listenerCount("drain")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
  });

  it("stops reading the account and settles when the client disconnects mid-download", async () => {
    m.authenticateRequest.mockResolvedValue({ id: 42 });
    let lapPages = 0;
    const bigRow = (id: number) => ({ id, activity_id: 1, payload: "x".repeat(2_000) });
    m.execute.mockImplementation(async (query: any) => {
      const text = query.queryChunks.map((chunk: any) => (Array.isArray(chunk?.value) ? chunk.value.join("") : "")).join("");
      if (text.includes("FROM users")) return { rows: [{ id: 42 }] };
      if (text.includes("FROM garmin_activity_laps")) {
        // Endless full pages: only the disconnect can end this export.
        lapPages += 1;
        const start = lapPages * 1000;
        return { rows: Array.from({ length: 1000 }, (_, i) => bigRow(start + i)) };
      }
      return { rows: [] };
    });

    const controller = new AbortController();
    const response = await fetch(`${baseUrl}/api/account/export`, { signal: controller.signal });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();

    await vi.waitFor(() => expect(m.events).toContain("account:export_client_closed"), { timeout: 10_000 });
    const pagesAtClose = lapPages;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lapPages).toBe(pagesAtClose);
    expect(m.events).not.toContain("account:export_failed");
  }, 15_000);
});
