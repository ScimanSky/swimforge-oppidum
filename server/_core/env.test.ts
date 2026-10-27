import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MODEL_VARS = [
  "GEMINI_TEXT_MODEL",
  "GEMINI_MODEL",
  "FORGE_LLM_MODEL",
  "GEMINI_PRO_MODEL",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_IMAGE_PRO_MODEL",
] as const;

const saved: Partial<Record<string, string | undefined>> = {};

const loadEnv = async () => (await import("./env")).ENV;

describe("Gemini model configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const name of MODEL_VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of MODEL_VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("uses the current defaults when nothing is set", async () => {
    const env = await loadEnv();
    expect(env.geminiTextModel).toBe("gemini-3.8-flash");
    expect(env.geminiProModel).toBe("gemini-3.1-pro-preview");
    expect(env.geminiImageModel).toBe("gemini-3.1-flash-image");
    expect(env.geminiImageProModel).toBe("gemini-3-pro-image-preview");
    expect(env.forgeLlmModel).toBe("gemini-3.8-flash");
  });

  it("prefers GEMINI_TEXT_MODEL over the legacy variables", async () => {
    process.env.GEMINI_TEXT_MODEL = " gemini-2.5-flash ";
    process.env.GEMINI_MODEL = "legacy-model";
    process.env.FORGE_LLM_MODEL = "forge-model";
    const env = await loadEnv();
    expect(env.geminiTextModel).toBe("gemini-2.5-flash");
    expect(env.forgeLlmModel).toBe("forge-model");
  });

  it("falls back to GEMINI_MODEL, then FORGE_LLM_MODEL, skipping blanks", async () => {
    process.env.GEMINI_TEXT_MODEL = "  ";
    process.env.GEMINI_MODEL = "legacy-model";
    expect((await loadEnv()).geminiTextModel).toBe("legacy-model");

    vi.resetModules();
    delete process.env.GEMINI_MODEL;
    process.env.FORGE_LLM_MODEL = "forge-model";
    expect((await loadEnv()).geminiTextModel).toBe("forge-model");
  });

  it("reads the pro and image overrides", async () => {
    process.env.GEMINI_PRO_MODEL = "pro-x";
    process.env.GEMINI_IMAGE_MODEL = "image-x";
    process.env.GEMINI_IMAGE_PRO_MODEL = "image-pro-x";
    const env = await loadEnv();
    expect([env.geminiProModel, env.geminiImageModel, env.geminiImageProModel]).toEqual(["pro-x", "image-x", "image-pro-x"]);
  });
});
