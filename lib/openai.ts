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
  process.env.OPENAI_SYNTHESIS_MODEL ?? "gpt-4o";

// Reserved for future RAG-style rerank passes.
export const RERANK_MODEL =
  process.env.OPENAI_RERANK_MODEL ?? "gpt-4o-mini";

export const EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
