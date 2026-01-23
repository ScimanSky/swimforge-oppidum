import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock database functions
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

describe("Garmin Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getGarminStatus", () => {
    it("returns connected: false when database is unavailable", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const { getGarminStatus } = await import("./garmin");
      const result = await getGarminStatus(1);

      expect(result).toEqual({ connected: false });
    });

    it("returns connected: false when no tokens exist", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const { getGarminStatus } = await import("./garmin");
      const result = await getGarminStatus(1);

      expect(result).toEqual({ connected: false });
    });

    it("returns connected: true with email when tokens exist", async () => {
      const mockTokens = [{
        garminEmail: "test@garmin.com",
        lastSyncAt: new Date("2024-01-15"),
      }];

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockTokens),
      };

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const { getGarminStatus } = await import("./garmin");
      const result = await getGarminStatus(1);

      expect(result.connected).toBe(true);
      expect(result.email).toBe("test@garmin.com");
      expect(result.lastSync).toEqual(new Date("2024-01-15"));
    });
  });

  describe("connectGarmin", () => {
    it("returns error when database is unavailable", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const { connectGarmin } = await import("./garmin");
      const result = await connectGarmin(1, "test@email.com", "password");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database not available");
    });
  });

  describe("disconnectGarmin", () => {
    it("returns false when database is unavailable", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const { disconnectGarmin } = await import("./garmin");
      const result = await disconnectGarmin(1);

      expect(result).toBe(false);
    });
  });

  describe("syncGarminActivities", () => {
    it("returns error when database is unavailable", async () => {
      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(null);

      const { syncGarminActivities } = await import("./garmin");
      const result = await syncGarminActivities(1, 30);

      expect(result.synced).toBe(0);
      expect(result.error).toBe("Database not available");
    });

    it("returns error when Garmin not connected", async () => {
      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const { getDb } = await import("./db");
      vi.mocked(getDb).mockResolvedValue(mockDb as any);

      const { syncGarminActivities } = await import("./garmin");
      const result = await syncGarminActivities(1, 30);

      expect(result.synced).toBe(0);
      expect(result.error).toBe("Garmin non collegato");
    });
  });
});
