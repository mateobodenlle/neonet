import "server-only";

/**
 * Logging layer for OpenAI calls.
 *
 *   withLlmLogging — wraps an OpenAI call, records duration + usage + cost.
 *   logLlmCall     — low-level insert; never throws (errors here must not
 *                    break the operation that triggered the call).
 *
 * Cost is estimated at log time from PRICING_TABLE. Unknown models log a
 * null cost rather than a wrong number.
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { PRICING_TABLE } from "./openai-pricing";

export type LlmPurpose =
  | "extraction"
  | "extraction-for-person"
  | "synthesis-incremental"
  | "synthesis-rebuild"
  | "embedding-observation"
  | "embedding-profile"
  | "embedding-query"
  | "rerank"
  | "other";

export interface LogInput {
  id?: string;
  purpose: LlmPurpose;
  model: string;
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  success?: boolean;
  errorMessage?: string;
  personIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface OpenAIUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export function estimateCostUsd(
  model: string,
  promptTokens = 0,
  cachedTokens = 0,
  completionTokens = 0,
): number | null {
  const rates = PRICING_TABLE[model];
  if (!rates) return null;
  const billedInput = Math.max(0, promptTokens - cachedTokens);
  const cost =
    (billedInput * rates.input +
      cachedTokens * rates.cachedInput +
      completionTokens * rates.output) /
    1_000_000;
  return Number(cost.toFixed(6));
}

export async function logLlmCall(input: LogInput): Promise<void> {
  try {
    const total =
      input.promptTokens != null || input.completionTokens != null
        ? (input.promptTokens ?? 0) + (input.completionTokens ?? 0)
        : null;
    const cost = estimateCostUsd(
      input.model,
      input.promptTokens,
      input.cachedTokens,
      input.completionTokens,
    );
    const { error } = await supabaseAdmin.from("llm_calls").insert({
      ...(input.id ? { id: input.id } : {}),
      purpose: input.purpose,
      model: input.model,
      prompt_tokens: input.promptTokens ?? null,
      cached_tokens: input.cachedTokens ?? null,
      completion_tokens: input.completionTokens ?? null,
      total_tokens: total,
      duration_ms: input.durationMs ?? null,
      cost_usd_estimated: cost,
      success: input.success ?? true,
      error_message: input.errorMessage ?? null,
      person_ids: input.personIds ?? [],
      metadata: input.metadata ?? {},
    });
    if (error) console.error("logLlmCall: insert failed", error);
  } catch (e) {
    console.error("logLlmCall: unexpected error", e);
  }
}

type WrapperBase = Omit<LogInput, "id" | "durationMs" | "success" | "errorMessage" |
  "promptTokens" | "cachedTokens" | "completionTokens">;

export interface LlmLogTrace {
  llmCallId: string;
  durationMs: number;
  promptTokens?: number;
  cachedTokens?: number;
  completionTokens?: number;
  success: boolean;
  errorMessage?: string;
}

export async function withLlmLogging<T>(
  base: WrapperBase,
  fn: () => Promise<{ result: T; usage?: OpenAIUsageLike; extraMetadata?: Record<string, unknown> }>,
): Promise<T> {
  const r = await withLlmLoggingDetailed(base, fn);
  return r.result;
}

export async function withLlmLoggingDetailed<T>(
  base: WrapperBase,
  fn: () => Promise<{ result: T; usage?: OpenAIUsageLike; extraMetadata?: Record<string, unknown> }>,
): Promise<{ result: T; trace: LlmLogTrace }> {
  const llmCallId = randomUUID();
  const start = Date.now();
  try {
    const { result, usage, extraMetadata } = await fn();
    const durationMs = Date.now() - start;
    const promptTokens = usage?.prompt_tokens;
    const cachedTokens = usage?.prompt_tokens_details?.cached_tokens;
    const completionTokens = usage?.completion_tokens;
    void logLlmCall({
      ...base,
      id: llmCallId,
      metadata: extraMetadata ? { ...(base.metadata ?? {}), ...extraMetadata } : base.metadata,
      durationMs,
      success: true,
      promptTokens,
      cachedTokens,
      completionTokens,
    });
    return {
      result,
      trace: {
        llmCallId,
        durationMs,
        promptTokens,
        cachedTokens,
        completionTokens,
        success: true,
      },
    };
  } catch (e) {
    const durationMs = Date.now() - start;
    const errorMessage = e instanceof Error ? e.message : String(e);
    void logLlmCall({
      ...base,
      id: llmCallId,
      durationMs,
      success: false,
      errorMessage,
    });
    throw e;
  }
}
