import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";

const m = vi.hoisted(() => ({
  redis: { isOpen: true, isReady: true, ping: vi.fn() },
  getDb: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/cache", () => ({ redis: m.redis }));
vi.mock("../db", () => ({ getDb: m.getDb }));
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

import { healthRouter } from "./health";
import { REDIS_COMMAND_TIMEOUT_MS, resetRedisCircuit } from "../lib/with-timeout";

let server: Server;
let baseUrl = "";
const never = () => new Promise<never>(() => {});
const previousRedisUrl = process.env.REDIS_URL;

beforeAll(async () => {
  process.env.REDIS_URL = "rediss://example.upstash.io:6379";
  const app = express();
  app.use(healthRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = previousRedisUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRedisCircuit();
  m.redis.isOpen = true;
  m.redis.isReady = true;
  m.getDb.mockResolvedValue({ execute: vi.fn(async () => ({ rows: [] })) });
});

describe("health routes with a hung Redis", () => {
  it("/healthz answers 200 immediately without touching Redis or the database", async () => {
    m.redis.ping.mockImplementation(never);
    m.getDb.mockImplementation(never);
    const start = Date.now();
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(500);
    expect(m.redis.ping).not.toHaveBeenCalled();
    expect(m.getDb).not.toHaveBeenCalled();
  });

  it("/ready answers within a few seconds and reports redis false", async () => {
    m.redis.ping.mockImplementation(never);
    const start = Date.now();
    const res = await fetch(`${baseUrl}/ready`);
    const elapsed = Date.now() - start;
    const body = await res.json();
    expect(elapsed).toBeLessThan(REDIS_COMMAND_TIMEOUT_MS + 1000);
    expect(body).toMatchObject({ database: true, redis: false });
  });

  it("/ready answers within a few seconds when the database hangs", async () => {
    m.redis.ping.mockResolvedValue("PONG");
    m.getDb.mockImplementation(never);
    const start = Date.now();
    const res = await fetch(`${baseUrl}/ready`);
    const elapsed = Date.now() - start;
    expect(res.status).toBe(503);
    expect(elapsed).toBeLessThan(5000);
    expect(await res.json()).toMatchObject({ database: false, redis: true });
  }, 10_000);
});

describe("health routes while Redis reconnects (open but not ready)", () => {
  beforeEach(() => {
    m.redis.isOpen = true;
    m.redis.isReady = false;
  });

  it("/ready reports redis false without sending PING", async () => {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/ready`);
    expect(Date.now() - start).toBeLessThan(500);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ database: true, redis: false });
    expect(m.redis.ping).not.toHaveBeenCalled();
  });

  it("/health reports redis not connected without sending PING", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = await res.json();
    expect(body.checks.redis).toBe(false);
    expect(body.details.redis).toEqual({ message: "redis not connected" });
    expect(m.redis.ping).not.toHaveBeenCalled();
  }, 10_000);
});
