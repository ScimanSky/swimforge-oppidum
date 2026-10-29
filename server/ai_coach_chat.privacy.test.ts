import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleSwimMetrics } from "./swim_metrics/test-helpers";

// What the coach chat sends to the model about the athlete: swim numbers only, never the
// profile's identity fields nor the raw Garmin payload or free text of the swims.

const h = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  getSwimMetrics: vi.fn(),
  getSwimmerProfile: vi.fn(),
  getActivities: vi.fn(),
  listActivityInsights: vi.fn(),
}));

vi.mock("./_core/llm", () => ({ invokeLLM: h.invokeLLM }));
vi.mock("./db", () => ({ getSwimmerProfile: h.getSwimmerProfile, getActivities: h.getActivities }));
vi.mock("./swim_metrics", () => ({ getSwimMetrics: h.getSwimMetrics }));
vi.mock("./ai_coach", () => ({ getExistingWorkouts: vi.fn(async () => null) }));
vi.mock("./ai_activity_insights", () => ({ listActivityInsights: h.listActivityInsights }));

import { generateCoachChatReply } from "./ai_coach_chat";

const previousKey = process.env.BUILT_IN_FORGE_API_KEY;

const profile = {
  userId: 7,
  level: 5,
  totalXp: 3000,
  totalSessions: 40,
  totalDistanceMeters: 90000,
  lastName: "Rossi",
  username: "mario.rossi.swim",
  location: "Cagliari",
  bio: "Nuoto alla piscina Terramaini",
  birthDate: "1980-04-12",
  avatarUrl: "https://ik.imagekit.io/swimforge/profiles/7/avatar.jpg",
};

const swim = {
  id: 41,
  activityDate: new Date(Date.UTC(2026, 9, 27, 8)),
  distanceMeters: 2000,
  durationSeconds: 2400,
  avgPacePer100m: 120,
  avgSwolf: 38,
  poolLengthMeters: 25,
  isOpenWater: false,
  activityName: "Cagliari Nuoto in piscina",
  location: "Piscina Comunale Terramaini",
  notes: "Con Giulia",
  rawData: { activity: { ownerFullName: "Mario Rossi", startLatitude: 39.2238411, startLongitude: 9.1216613 } },
};

describe("coach chat prompt privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BUILT_IN_FORGE_API_KEY = "test-key";
    h.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Lettura dati: ok" } }] });
    h.getSwimMetrics.mockResolvedValue(sampleSwimMetrics());
    h.getSwimmerProfile.mockResolvedValue(profile);
    h.getActivities.mockResolvedValue([swim]);
    h.listActivityInsights.mockResolvedValue([]);
  });

  afterAll(() => {
    if (previousKey === undefined) delete process.env.BUILT_IN_FORGE_API_KEY;
    else process.env.BUILT_IN_FORGE_API_KEY = previousKey;
  });

  it("sends no name, username, birth date, place, notes, coordinates or raw Garmin keys", async () => {
    await generateCoachChatReply(7, [{ role: "user", content: "Come sto?" }]);
    const prompt = h.invokeLLM.mock.calls[0][0].messages[0].content as string;
    for (const value of [
      "Rossi",
      "mario.rossi",
      "1980-04-12",
      "Cagliari",
      "Terramaini",
      "Giulia",
      "imagekit",
      "ownerFullName",
      "startLatitude",
      "rawData",
    ]) {
      expect(prompt).not.toContain(value);
    }
    expect(prompt).not.toMatch(/39[.,]22|9[.,]121/);
    // The swim itself is there, as numbers.
    expect(prompt).toContain("2000m · 40 min · passo 2:00/100m · SWOLF 38");
  });
});
