import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import { logger } from "../middleware/logger";
import { ENV } from "./env";

export type TextLlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateTextParams = {
  messages: TextLlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export type GenerateTextResult = {
  text: string;
  provider: "local" | "gemini";
  model: string;
  usedFallbackModel: boolean;
};

export type GenerateJsonParams<T> = GenerateTextParams & {
  validate?: (value: unknown) => T;
};

const log = logger.child({ component: "text_llm" });

type OpenAiCompatChoice = {
  message?: {
    content?: unknown;
  };
};

type OpenAiCompatResponse = {
  choices?: OpenAiCompatChoice[];
  error?: {
    message?: string;
  };
};

function buildModelChain(modelOverride?: string): string[] {
  const primary = (modelOverride ?? ENV.localLlmModel).trim();
  const fallback = ENV.localLlmFallbackModel.trim();
  const chain = [primary, fallback].filter(Boolean);
  return chain.filter((model, index) => chain.indexOf(model) === index);
}

function normalizeAssistantContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const typedPart = part as { type?: string; text?: string };
      if (typedPart.type === "text" && typeof typedPart.text === "string") {
        return typedPart.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

function extractJsonObject(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  if (cleaned.startsWith("{")) {
    return cleaned;
  }

  const fenced = cleaned.match(/```json\s*([\s\S]*?)\s*```/i) ?? cleaned.match(/```\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  return objectMatch?.[0]?.trim() ?? null;
}

function buildGeminiPrompt(messages: TextLlmMessage[]): string {
  return messages
    .map((entry) => `${entry.role.toUpperCase()}:\n${entry.content}`)
    .join("\n\n");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function callLocalModel(params: {
  model: string;
  messages: TextLlmMessage[];
  maxTokens: number;
  timeoutMs: number;
  temperature?: number;
}): Promise<string> {
  const url = `${ENV.localLlmBaseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.localLlmApiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: false,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as OpenAiCompatResponse | null;

    if (!response.ok) {
      const message = payload?.error?.message?.trim() || `LLM request failed (${response.status})`;
      throw new Error(message);
    }

    const text = normalizeAssistantContent(payload?.choices?.[0]?.message?.content);
    if (!text) {
      throw new Error("Local LLM returned empty content");
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Local LLM timeout after ${params.timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiModel(params: {
  model: string;
  messages: TextLlmMessage[];
  maxTokens: number;
  timeoutMs: number;
  temperature?: number;
}): Promise<string> {
  if (!ENV.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({ apiKey: ENV.geminiApiKey });
  const response = await withTimeout(
    ai.models.generateContent({
      model: params.model,
      contents: buildGeminiPrompt(params.messages),
      config: {
        maxOutputTokens: params.maxTokens,
        temperature: params.temperature,
      },
    }),
    params.timeoutMs,
    `Gemini timeout after ${params.timeoutMs}ms`,
  );

  const text = String(response.text ?? "").trim();
  if (!text) {
    throw new Error("Gemini returned empty content");
  }
  return text;
}

export async function generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
  const messages = params.messages
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content ?? "").trim(),
    }))
    .filter((entry) => entry.content.length > 0);

  if (messages.length === 0) {
    throw new Error("generateText requires at least one non-empty message");
  }

  const models = buildModelChain(params.model);
  if (models.length === 0) {
    throw new Error("LOCAL_LLM_MODEL is not configured");
  }

  const timeoutMs = params.timeoutMs ?? config.LOCAL_LLM_TIMEOUT_MS;
  const maxTokens = params.maxTokens ?? config.LOCAL_LLM_MAX_TOKENS;
  const errors: string[] = [];

  if (ENV.llmProvider === "gemini") {
    const cloudModel = params.model?.trim() || ENV.geminiTextModel;
    const cloudTimeoutMs = params.timeoutMs ?? ENV.geminiTextTimeoutMs ?? config.GEMINI_TEXT_TIMEOUT_MS;
    const startedAt = Date.now();
    const text = await callGeminiModel({
      model: cloudModel,
      messages,
      maxTokens,
      timeoutMs: cloudTimeoutMs,
      temperature: params.temperature,
    });
    log.info("[text_llm] gemini direct provider used", {
      event: "text_llm:gemini_direct_used",
      cloudModel,
      latencyMs: Date.now() - startedAt,
    });
    return {
      text,
      provider: "gemini",
      model: cloudModel,
      usedFallbackModel: false,
    };
  }

  if (ENV.llmProvider !== "local") {
    throw new Error(`Unsupported LLM_PROVIDER: ${ENV.llmProvider}`);
  }

  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    try {
      const text = await callLocalModel({
        model,
        messages,
        maxTokens,
        timeoutMs,
        temperature: params.temperature,
      });

      if (index > 0) {
        log.warn("[text_llm] fallback model used", {
          event: "text_llm:fallback_model_used",
          primaryModel: models[0],
          fallbackModel: model,
          attempts: index + 1,
        });
      }

      return {
        text,
        provider: "local",
        model,
        usedFallbackModel: index > 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${model}: ${message}`);
      log.warn("[text_llm] model attempt failed", {
        event: "text_llm:model_attempt_failed",
        model,
        attempt: index + 1,
        message,
      });
    }
  }

  const cloudFallbackProvider = ENV.cloudTextFallbackProvider;
  if (cloudFallbackProvider === "gemini") {
    const cloudModel = ENV.geminiTextModel;
    const cloudTimeoutMs = ENV.geminiTextTimeoutMs || config.GEMINI_TEXT_TIMEOUT_MS;
    const reason = errors.join(" | ");
    const startedAt = Date.now();

    try {
      const text = await callGeminiModel({
        model: cloudModel,
        messages,
        maxTokens,
        timeoutMs: cloudTimeoutMs,
        temperature: params.temperature,
      });

      log.warn("[text_llm] cloud fallback used", {
        event: "text_llm:cloud_fallback_used",
        reason,
        localModel: models[0],
        cloudModel,
        latencyMs: Date.now() - startedAt,
      });

      return {
        text,
        provider: "gemini",
        model: cloudModel,
        usedFallbackModel: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`gemini:${cloudModel}: ${message}`);
      log.warn("[text_llm] cloud fallback failed", {
        event: "text_llm:cloud_fallback_failed",
        cloudModel,
        message,
      });
    }
  }

  throw new Error(`All text LLM attempts failed: ${errors.join(" | ")}`);
}

export async function generateJson<T = unknown>(params: GenerateJsonParams<T>): Promise<{
  value: T;
  provider: "local" | "gemini";
  model: string;
  usedFallbackModel: boolean;
}> {
  const result = await generateText(params);
  const jsonSource = extractJsonObject(result.text);
  if (!jsonSource) {
    throw new Error("Text LLM did not return JSON content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON from local LLM: ${message}`);
  }

  const value = params.validate ? params.validate(parsed) : (parsed as T);
  return {
    value,
    provider: result.provider,
    model: result.model,
    usedFallbackModel: result.usedFallbackModel,
  };
}
