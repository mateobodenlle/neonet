import "server-only";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

export const openai = new OpenAI({ apiKey });

// Model selection. Defaults are tuned for cost; bump to gpt-4o on critical
// paths if extraction quality regresses.
export const EXTRACTION_MODEL =
  process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";

// Synthesis is the highest-leverage path — its output is the directory
// snippet every extraction sees. Quality matters more than per-call cost.
export const SYNTHESIS_MODEL =
  process.env.OPENAI_SYNTHESIS_MODEL ?? "gpt-5";

// Reserved for future RAG-style rerank passes.
export const RERANK_MODEL =
  process.env.OPENAI_RERANK_MODEL ?? "gpt-4o-mini";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

// Reasoning models reject any `temperature` other than their default and
// 400 on the request (see the synthesis gpt-5 incident). Prefix list —
// widen it as new reasoning families ship (gpt-5.x, o5, ...).
const REASONING_MODEL_PREFIXES = ["gpt-5", "o1", "o3", "o4"];

export function isReasoningModel(model: string): boolean {
  return REASONING_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix));
}

// Spread into a ChatCompletionCreateParams object. Returns {} for reasoning
// models so the call falls back to their fixed default temperature.
export function temperatureParam(
  model: string,
  value: number
): { temperature?: number } {
  return isReasoningModel(model) ? {} : { temperature: value };
}
