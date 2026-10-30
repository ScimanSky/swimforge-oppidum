import { beforeEach, describe, expect, it, vi } from "vitest";

// The per-swim analysis prompt sent to Gemini: only the explicit swim fields, never the raw
// Garmin JSON (owner name, start coordinates, place names) nor the free text of the swim.

const m = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-key";
  return { prompts: [] as string[] };
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        generateContent: async (prompt: string) => {
          m.prompts.push(prompt);
          return {
            response: {
              text: () => JSON.stringify({ title: "T", summary: "S", bullets: ["a", "b", "c"], tags: [] }),
            },
          };
        },
      };
    }
  },
}));
// No database: no lap block, the prompt comes from the activity row alone.
vi.mock("./db", () => ({ getDb: async () => null }));
vi.mock("./_core/env", () => ({ ENV: { geminiTextModel: "test-model" } }));

import { generateActivityInsight } from "./ai_activity_insights";

/** A Garmin swim as stored by the sync: explicit columns plus the whole Garmin payload. */
function garminSwim() {
  return {
    id: 41,
    user_id: 7,
    activity_source: "garmin",
    garmin_activity_id: "19876543210",
    activity_name: "Cagliari Nuoto in piscina",
    location: "Piscina Comunale Terramaini, Cagliari",
    notes: "Oggi con Giulia, dolore alla spalla",
    distance_meters: 2000,
    duration_seconds: 2400,
    pool_length_meters: 25,
    stroke_type: "freestyle",
    avg_pace_per_100m: 120,
    avg_heart_rate: 138,
    max_heart_rate: 162,
    swolf_score: 38,
    laps_count: 80,
    avg_strokes: 16,
    avg_stroke_cadence: 28,
    avg_stroke_distance: 190,
    training_effect: 32,
    anaerobic_training_effect: 11,
    hr_zone_1_seconds: 300,
    hr_zone_2_seconds: 900,
    hr_zone_3_seconds: 800,
    hr_zone_4_seconds: 350,
    hr_zone_5_seconds: 50,
    is_open_water: false,
    raw_data: {
      activity: {
        activityId: 19876543210,
        activityName: "Cagliari Nuoto in piscina",
        ownerId: 99887766,
        ownerFullName: "Mario Rossi",
        ownerDisplayName: "mario.rossi.swim",
        userProfileId: 99887766,
        startLatitude: 39.2238411,
        startLongitude: 9.1216613,
        endLatitude: 39.2238999,
        endLongitude: 9.1217001,
        locationName: "Cagliari",
        deviceId: 3412345678,
        distance: 2000,
        duration: 2400,
        averageHR: 138,
        maxHR: 162,
        poolLength: 2500,
      },
    },
  };
}

const RAW_KEYS = [
  "activityId",
  "activityName",
  "ownerId",
  "ownerFullName",
  "ownerDisplayName",
  "userProfileId",
  "startLatitude",
  "startLongitude",
  "endLatitude",
  "locationName",
  "deviceId",
  "poolLength",
  "averageHR",
];

describe("activity insight prompt", () => {
  beforeEach(() => {
    m.prompts.length = 0;
  });

  it("sends no raw Garmin JSON, no names, no coordinates and no free-text place or notes", async () => {
    await expect(generateActivityInsight(garminSwim())).resolves.toMatchObject({ title: "T" });
    expect(m.prompts).toHaveLength(1);
    const prompt = m.prompts[0];

    for (const key of RAW_KEYS) expect(prompt).not.toContain(key);
    expect(prompt).not.toMatch(/\{"/);
    expect(prompt).not.toMatch(/raw data/i);
    // Owner, device and Garmin ids.
    for (const value of ["Mario", "Rossi", "mario.rossi", "99887766", "3412345678", "19876543210"]) {
      expect(prompt).not.toContain(value);
    }
    // Coordinates, place names and the free text of the swim.
    expect(prompt).not.toMatch(/39[.,]22|9[.,]121/);
    for (const value of ["Cagliari", "Terramaini", "Piscina Comunale", "Giulia", "spalla"]) {
      expect(prompt).not.toContain(value);
    }
  });

  it("keeps the explicit swim fields: distance, time, pace, pool, heart rate and zones, SWOLF, strokes, TE", async () => {
    await generateActivityInsight(garminSwim());
    const prompt = m.prompts[0];
    expect(prompt).toContain("Distanza: 2000 m");
    expect(prompt).toContain("Durata: 2400 s");
    expect(prompt).toContain("Pace medio: 2:00/100m");
    expect(prompt).toContain("Vasca: 25 m");
    expect(prompt).toContain("HR medio: 138");
    expect(prompt).toContain("HR max: 162");
    expect(prompt).toContain("Zone FC (secondi): Z1 300, Z2 900, Z3 800, Z4 350, Z5 50");
    expect(prompt).toContain("SWOLF medio: 38");
    expect(prompt).toContain("Lap: 80");
    expect(prompt).toContain("Bracciate per vasca: 16");
    expect(prompt).toContain("Stroke: freestyle");
    // Stored ×10 (0-50): the prompt carries Garmin's 0-5 scale.
    expect(prompt).toContain("Training effect aerobico: 3.2/5");
    expect(prompt).toContain("Training effect anaerobico: 1.1/5");
    expect(prompt).not.toContain("Training effect: 32");
    // Integer centimetres per stroke.
    expect(prompt).toContain("Stroke distance: 190 cm");
  });

  it("reads the Garmin fallbacks on their own scale: TE already 0-5, stroke distance in metres", async () => {
    const swim = garminSwim() as Record<string, unknown>;
    delete swim.training_effect;
    delete swim.anaerobic_training_effect;
    delete swim.avg_stroke_distance;
    swim.raw_data = { activity: { aerobicTrainingEffect: 2.7, anaerobicTrainingEffect: 0.4, avgStrokeDistance: 1.85 } };
    await generateActivityInsight(swim);
    const prompt = m.prompts[0];
    expect(prompt).toContain("Training effect aerobico: 2.7/5");
    expect(prompt).toContain("Training effect anaerobico: 0.4/5");
    expect(prompt).toContain("Stroke distance: 185 cm");
  });

  it("writes n/d without units when the swim has no TE or stroke distance", async () => {
    const swim = garminSwim() as Record<string, unknown>;
    delete swim.training_effect;
    delete swim.anaerobic_training_effect;
    delete swim.avg_stroke_distance;
    swim.raw_data = null;
    await generateActivityInsight(swim);
    const prompt = m.prompts[0];
    expect(prompt).toContain("Training effect aerobico: n/d");
    expect(prompt).toContain("Training effect anaerobico: n/d");
    expect(prompt).toContain("Stroke distance: n/d");
  });

  it("never uses the Garmin activity name as the stroke", async () => {
    const swim = garminSwim();
    delete (swim as Partial<typeof swim>).stroke_type;
    await generateActivityInsight(swim);
    expect(m.prompts[0]).toContain("Stroke: n/d");
  });
});
