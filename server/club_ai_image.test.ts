import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  response: null as unknown,
  imagekitOk: true,
  cloudinaryOk: true,
  imageUrl: "https://cdn.example.com/generated.png",
  fetchCalls: [] as Array<{ url: string }>,
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

describe("generateClubAiImageViaGemini", () => {
  beforeEach(() => {
    vi.resetModules();
    state.response = null;
    state.imagekitOk = true;
    state.cloudinaryOk = true;
    state.imageUrl = "https://cdn.example.com/generated.png";
    state.fetchCalls = [];
    process.env.CLUB_AI_POST_IMAGE_ENABLED = "true";
    process.env.CLUB_AI_POST_IMAGE_MODEL = "nano-banana-pro";
    process.env.IMAGEKIT_PRIVATE_KEY = "ik-private";
    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    process.env.CLOUDINARY_API_KEY = "demo-key";
    process.env.CLOUDINARY_API_SECRET = "demo-secret";
    delete process.env.GEMINI_API_KEY;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      state.fetchCalls.push({ url });

      if (url.includes("upload.imagekit.io")) {
        if (!state.imagekitOk) {
          return new Response(JSON.stringify({ message: "imagekit failed" }), { status: 500 });
        }
        return new Response(JSON.stringify({ url: state.imageUrl }), { status: 200 });
      }

      if (url.includes("api.cloudinary.com")) {
        if (!state.cloudinaryOk) {
          return new Response(JSON.stringify({ error: { message: "cloudinary failed" } }), { status: 500 });
        }
        return new Response(JSON.stringify({ secure_url: state.imageUrl }), { status: 200 });
      }

      return new Response("unexpected", { status: 404 });
    }) as unknown as typeof fetch);
  });

  it("returns an error when GEMINI_API_KEY is missing", async () => {
    const { generateClubAiImageViaGemini } = await import("./club_ai_image");
    const result = await generateClubAiImageViaGemini({
      clubId: 13,
      prompt: "poster",
    });

    expect(result.imageUrl).toBeUndefined();
    expect(result.error).toContain("GEMINI_API_KEY");
    expect(state.fetchCalls.length).toBe(0);
  });

  it("uploads generated inline image to ImageKit and returns public URL", async () => {
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
    expect(result.imageUrl).toBe(state.imageUrl);
    expect(state.fetchCalls.some((call) => call.url.includes("upload.imagekit.io"))).toBe(true);
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
    expect(state.fetchCalls.length).toBe(0);
  });

  it("falls back to Cloudinary when ImageKit upload fails", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    state.imagekitOk = false;
    state.cloudinaryOk = true;
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
      prompt: "poster",
    });

    expect(result.error).toBeUndefined();
    expect(result.imageUrl).toBe(state.imageUrl);
    expect(state.fetchCalls.some((call) => call.url.includes("upload.imagekit.io"))).toBe(true);
    expect(state.fetchCalls.some((call) => call.url.includes("api.cloudinary.com"))).toBe(true);
  });
});
