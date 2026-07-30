import "server-only";
import OpenAI from "openai";
import { createChatClient, isOpenRouterModel } from "./llm-provider";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

// Direct OpenAI client. Chat calls should go through chatClientFor(model);
// embeddings and audio always use this one (OpenRouter serves neither).
export const openai = new OpenAI({ apiKey });

// One client per provider: bare model ids reuse the OpenAI client above,
// namespaced ids ("vendor/model") get a lazily-created OpenRouter client.
let openrouterClient: OpenAI | null = null;
export function chatClientFor(model: string): OpenAI {
  if (!isOpenRouterModel(model)) return openai;
  if (!openrouterClient) openrouterClient = createChatClient(model);
  return openrouterClient;
}

// Model selection. Defaults are tuned for cost; bump to gpt-4o on critical
// paths if extraction quality regresses. An OpenRouter-namespaced id in any
// of these env vars reroutes that path without further code changes.
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

// Re-exported so call sites keep a single import surface.
export {
  isReasoningModel,
  temperatureParam,
  providerBodyParams,
  isOpenRouterModel,
} from "./llm-provider";
