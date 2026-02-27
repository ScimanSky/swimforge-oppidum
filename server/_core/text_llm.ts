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
  provider: "local";
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

export async function generateText(params: GenerateTextParams): Promise<GenerateTextResult> {
  if (ENV.llmProvider !== "local") {
    throw new Error(`Unsupported LLM_PROVIDER: ${ENV.llmProvider}`);
  }

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

  throw new Error(`All local LLM attempts failed: ${errors.join(" | ")}`);
}

export async function generateJson<T = unknown>(params: GenerateJsonParams<T>): Promise<{
  value: T;
  provider: "local";
  model: string;
  usedFallbackModel: boolean;
}> {
  const result = await generateText(params);
  const jsonSource = extractJsonObject(result.text);
  if (!jsonSource) {
    throw new Error("Local LLM did not return JSON content");
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
