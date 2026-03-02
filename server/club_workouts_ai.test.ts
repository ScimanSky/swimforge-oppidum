import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  responses: new Map<string, string | Error>(),
  calls: [] as string[],
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    constructor(_apiKey: string) {}

    getGenerativeModel({ model }: { model: string }) {
      return {
        generateContent: async () => {
          mockState.calls.push(model);
          const response = mockState.responses.get(model);
          if (response instanceof Error) throw response;
          if (typeof response !== "string") {
            throw new Error(`Missing mock response for ${model}`);
          }
          return {
            response: {
              text: () => response,
            },
          };
        },
      };
    }
  },
}));

function setEnv() {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.CLUB_WORKOUTS_AI_MODEL_PRIMARY = "gemini-fast";
  process.env.CLUB_WORKOUTS_AI_MODEL_ESCALATION = "gemini-pro";
  process.env.CLUB_WORKOUTS_AI_QUALITY_THRESHOLD = "0.92";
  process.env.CLUB_WORKOUTS_AI_TIMEOUT_MS = "45000";
  process.env.CLUB_WORKOUTS_AI_REQUEST_TIMEOUT_SOFT_MS = "30000";
}

function createValidPayload() {
  const makeItem = (
    label: string,
    repsCount: number,
    distancePerRepMeters: number,
    sendoff: string,
    betweenSetsRest?: string,
  ) => ({
    label,
    stroke: "Stile Libero",
    reps: `${repsCount}x${distancePerRepMeters}`,
    repsCount,
    distancePerRepMeters,
    seriesDistanceMeters: repsCount * distancePerRepMeters,
    seriesDistanceLabel: `${repsCount * distancePerRepMeters}m`,
    sendoff,
    betweenSetsRest,
    intensity: "mixed",
    targetPace: "RPE 6-7",
    notes: "Controllo tecnico",
  });

  return {
    title: "Allenamento Master",
    description: "Sessione tecnica e aerobica",
    totalDistance: "2600m",
    estimatedDuration: "60 min",
    blocks: [
      {
        phase: "warmup",
        label: "Riscaldamento",
        items: [makeItem("Warmup 1", 4, 50, "1:05", "15s"), makeItem("Warmup 2", 4, 50, "1:05")],
      },
      {
        phase: "activation",
        label: "Attivazione",
        items: [makeItem("Activation 1", 4, 100, "1:55", "20s"), makeItem("Activation 2", 4, 50, "1:10")],
      },
      {
        phase: "main",
        label: "Main",
        items: [makeItem("Main 1", 8, 100, "1:45", "25s"), makeItem("Main 2", 6, 50, "1:00")],
      },
      {
        phase: "cooldown",
        label: "Defaticamento",
        items: [makeItem("Cooldown 1", 4, 50, "1:10", "15s"), makeItem("Cooldown 2", 2, 100, "2:20")],
      },
    ],
    coachNotes: ["Alternativa conservativa: +5 secondi sulle ripartenze."],
  };
}

function createInvalidPayload() {
  const payload = createValidPayload();
  return {
    ...payload,
    blocks: payload.blocks.map((block) => ({
      ...block,
      items: block.items.map((item, index) => {
        if (block.phase === "main" && index === 0) {
          return {
            ...item,
            sendoff: undefined,
            seriesDistanceMeters: 400,
            seriesDistanceLabel: "400m",
          };
        }
        return item;
      }),
    })),
  };
}

function createMissingStrokePayload() {
  const payload = createValidPayload();
  return {
    ...payload,
    blocks: payload.blocks.map((block) => {
      if (block.phase !== "activation") return block;
      return {
        ...block,
        items: block.items.map((item) => ({
          ...item,
          stroke: undefined,
        })),
      };
    }),
  };
}

describe("club_workouts_ai quality gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockState.responses.clear();
    mockState.calls.length = 0;
    setEnv();
  });

  it("keeps primary model when output quality is valid", async () => {
    mockState.responses.set("gemini-fast", JSON.stringify(createValidPayload()));

    const { generateClubPoolWorkoutPlan } = await import("./club_workouts_ai");
    const result = await generateClubPoolWorkoutPlan({
      sessionDate: "2026-03-10",
      directives: {
        focus: ["tecnica"],
        volume: "medium",
        intensity: "mixed",
        strokeMix: ["sl"],
        equipment: [],
        sessionMinutes: 60,
        targetDistanceMeters: 2600,
        notes: null,
      },
    });

    expect(result.status).toBe("success");
    expect(result.model).toBe("gemini-fast");
    expect(mockState.calls).toEqual(["gemini-fast"]);
    expect(result.quality.score).toBeGreaterThanOrEqual(0.92);
  });

  it("auto-fills missing stroke using fallback directives", async () => {
    mockState.responses.set("gemini-fast", JSON.stringify(createMissingStrokePayload()));

    const { generateClubPoolWorkoutPlan } = await import("./club_workouts_ai");
    const result = await generateClubPoolWorkoutPlan({
      sessionDate: "2026-03-10",
      directives: {
        focus: ["tecnica"],
        volume: "medium",
        intensity: "mixed",
        strokeMix: ["do"],
        equipment: [],
        sessionMinutes: 60,
        targetDistanceMeters: 2600,
        notes: null,
      },
    });

    const activationBlock = result.plan.blocks.find((block) => block.phase === "activation");
    expect(result.status).toBe("success");
    expect(mockState.calls).toEqual(["gemini-fast"]);
    expect(activationBlock?.items.every((item) => String(item.stroke ?? "").trim().length > 0)).toBe(true);
    expect(activationBlock?.items.every((item) => item.stroke === "Dorso")).toBe(true);
  });

  it("escalates to pro model when primary output has hard issues", async () => {
    mockState.responses.set("gemini-fast", JSON.stringify(createInvalidPayload()));
    mockState.responses.set("gemini-pro", JSON.stringify(createValidPayload()));

    const { generateClubPoolWorkoutPlan } = await import("./club_workouts_ai");
    const result = await generateClubPoolWorkoutPlan({
      sessionDate: "2026-03-10",
      directives: {
        focus: ["tecnica", "aerobico"],
        volume: "high",
        intensity: "mixed",
        strokeMix: ["sl", "do"],
        equipment: ["pull"],
        sessionMinutes: 75,
        targetDistanceMeters: null,
        notes: "Gruppo eterogeneo",
      },
    });

    expect(mockState.calls).toEqual(["gemini-fast", "gemini-pro"]);
    expect(result.model).toBe("gemini-pro");
    expect(result.status).toBe("success");
    expect(result.quality.escalated).toBe(true);
  });

  it("returns partial with auto-fix warnings when both models are invalid", async () => {
    const invalid = JSON.stringify(createInvalidPayload());
    mockState.responses.set("gemini-fast", invalid);
    mockState.responses.set("gemini-pro", invalid);

    const { generateClubPoolWorkoutPlan } = await import("./club_workouts_ai");
    const result = await generateClubPoolWorkoutPlan({
      sessionDate: "2026-03-10",
      directives: {
        focus: ["recupero"],
        volume: "light",
        intensity: "easy",
        strokeMix: ["sl"],
        equipment: [],
        sessionMinutes: 45,
        targetDistanceMeters: 1800,
        notes: null,
      },
    });

    expect(mockState.calls).toEqual(["gemini-fast", "gemini-pro"]);
    expect(result.status).toBe("partial");
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.join(" ")).toContain("Auto-fix");
    expect(result.plan.blocks[2].items[0].seriesDistanceMeters).toBe(800);
  });
});
