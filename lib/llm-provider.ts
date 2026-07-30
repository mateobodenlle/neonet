/**
 * Chat model → provider routing.
 *
 * Namespaced model ids ("deepseek/deepseek-v4-flash") route to OpenRouter;
 * bare ids ("gpt-4o") route to OpenAI. Embeddings and audio are not covered:
 * OpenRouter serves neither, so they always go through the OpenAI client in
 * lib/openai.ts.
 *
 * Pure module (no "server-only") so the eval/CLI scripts can share it.
 */

import OpenAI from "openai";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function isOpenRouterModel(model: string): boolean {
  return model.includes("/");
}

// Reasoning models reject any `temperature` other than their default and
// 400 on the request (see the synthesis gpt-5 incident). Checks apply to the
// bare model name (namespace stripped) — widen as new families ship.
const REASONING_MODEL_PREFIXES = ["gpt-5", "o1", "o3", "o4"];

export function isReasoningModel(model: string): boolean {
  const bare = model.slice(model.lastIndexOf("/") + 1);
  return (
    REASONING_MODEL_PREFIXES.some((prefix) => bare.startsWith(prefix)) ||
    bare.includes("thinking") ||
    bare.includes("reasoner")
  );
}

// Spread into a ChatCompletionCreateParams object. Returns {} for reasoning
// models so the call falls back to their fixed default temperature.
export function temperatureParam(
  model: string,
  value: number
): { temperature?: number } {
  return isReasoningModel(model) ? {} : { temperature: value };
}

// OpenRouter serves one model id through several endpoints, and json_schema
// enforcement is per-endpoint: require_parameters restricts routing to
// endpoints that actually honor response_format. No-op for OpenAI models.
export function providerBodyParams(model: string): {
  provider?: { require_parameters: boolean };
} {
  return isOpenRouterModel(model)
    ? { provider: { require_parameters: true } }
    : {};
}

export function createChatClient(model: string): OpenAI {
  if (isOpenRouterModel(model)) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(`Missing OPENROUTER_API_KEY for model ${model}`);
    }
    return new OpenAI({ baseURL: OPENROUTER_BASE_URL, apiKey });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}
