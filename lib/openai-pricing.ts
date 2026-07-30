/**
 * OpenAI pricing table (USD per 1M tokens).
 *
 * Source: openai.com/api/pricing (last reviewed 2026-05-02). Update when
 * either OpenAI publishes new rates or we start using a model not listed
 * here — `estimateCostUsd` returns null for unknown models, so a missing
 * entry shows up as null cost in llm_calls rather than a wrong number.
 *
 * `cachedInput` is the price for input tokens served from the prompt cache
 * (response.usage.prompt_tokens_details.cached_tokens). Embedding models
 * do not have a cached tier; we set cachedInput == input so the formula
 * stays uniform.
 */

export interface ModelRates {
  input: number;
  cachedInput: number;
  output: number;
}

export const PRICING_TABLE: Record<string, ModelRates> = {
  // Chat models currently in use.
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },

  // Chat models we may switch to (kept here so cost calc keeps working
  // without a code change if OPENAI_*_MODEL env vars are flipped).
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-4.1": { input: 2.0, cachedInput: 0.5, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "o4-mini": { input: 1.1, cachedInput: 0.275, output: 4.4 },

  // Embeddings (no cached tier).
  "text-embedding-3-small": { input: 0.02, cachedInput: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, cachedInput: 0.13, output: 0 },

  // OpenRouter-routed models (openrouter.ai/api/v1/models, reviewed
  // 2026-07-30). Namespaced ids match what llm_calls records when a
  // OPENAI_*_MODEL env var points at OpenRouter. Models without a cached
  // tier on their serving endpoints use cachedInput == input.
  "deepseek/deepseek-v4-flash": { input: 0.14, cachedInput: 0.028, output: 0.28 },
  "deepseek/deepseek-v4-pro": { input: 0.435, cachedInput: 0.0036, output: 0.87 },
  "qwen/qwen3.5-flash-02-23": { input: 0.065, cachedInput: 0.065, output: 0.26 },
  "z-ai/glm-4.7-flash": { input: 0.06, cachedInput: 0.01, output: 0.4 },
  "z-ai/glm-5": { input: 0.95, cachedInput: 0.2, output: 2.55 },
  "moonshotai/kimi-k2.6": { input: 0.646, cachedInput: 0.1088, output: 2.72 },
  "minimax/minimax-m2.5": { input: 0.15, cachedInput: 0.05, output: 0.9 },
  "openai/gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "openai/gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
};
