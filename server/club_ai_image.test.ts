import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  response: null as unknown,
  uploadError: null as { message: string } | null,
  publicUrl: "https://cdn.example.com/generated.png",
  uploadCalls: [] as Array<{ path: string; contentType: string }>,
}));

vi.mock("@google/genai", () => ({
  Modality: {
    IMAGE: "IMAGE",
  },
  GoogleGenAI: class {
    constructor(_params: { apiKey: string }) {}

    models = {
      generateContent: async () => state.response,
    };
  },
}));

vi.mock("./_core/supabase_admin", () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, _data: Buffer, options: { contentType: string }) => {
          state.uploadCalls.push({ path, contentType: options.contentType });
          return { error: state.uploadError };
        },
        getPublicUrl: () => ({ data: { publicUrl: state.publicUrl } }),
      }),
    },
  }),
}));

describe("generateClubAiImageViaGemini", () => {
  beforeEach(() => {
    vi.resetModules();
    state.response = null;
    state.uploadError = null;
    state.publicUrl = "https://cdn.example.com/generated.png";
    state.uploadCalls = [];
    process.env.CLUB_AI_POST_IMAGE_ENABLED = "true";
    process.env.CLUB_AI_POST_IMAGE_MODEL = "nano-banana-pro";
    delete process.env.GEMINI_API_KEY;
  });

  it("returns an error when GEMINI_API_KEY is missing", async () => {
    const { generateClubAiImageViaGemini } = await import("./club_ai_image");
    const result = await generateClubAiImageViaGemini({
      clubId: 13,
      prompt: "poster",
    });

    expect(result.imageUrl).toBeUndefined();
    expect(result.error).toContain("GEMINI_API_KEY");
    expect(state.uploadCalls.length).toBe(0);
  });

  it("uploads generated inline image to Supabase and returns public URL", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.response = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data: Buffer.from("fake-image").toString("base64"),
                  mimeType: "image/png",
                },
              },
            ],
          },
        },
      ],
    };

    const { generateClubAiImageViaGemini } = await import("./club_ai_image");
    const result = await generateClubAiImageViaGemini({
      clubId: 13,
      prompt: "Motivational poster for masters swimmers",
    });

    expect(result.error).toBeUndefined();
    expect(result.imageUrl).toBe("https://cdn.example.com/generated.png");
    expect(state.uploadCalls.length).toBe(1);
    expect(state.uploadCalls[0]?.path).toContain("clubs/13/ai-posts/");
    expect(state.uploadCalls[0]?.contentType).toBe("image/png");
  });

  it("returns an error when image data is missing from model response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.response = {
      candidates: [
        {
          content: {
            parts: [{ text: "no image here" }],
          },
        },
      ],
    };

    const { generateClubAiImageViaGemini } = await import("./club_ai_image");
    const result = await generateClubAiImageViaGemini({
      clubId: 13,
      prompt: "poster",
    });

    expect(result.imageUrl).toBeUndefined();
    expect(result.error).toContain("inline image");
    expect(state.uploadCalls.length).toBe(0);
  });
});
