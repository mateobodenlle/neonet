import "server-only";

// Persistence helpers for the internal eval builder. ALL operations here are
// best-effort: failures are logged but never propagated to the NL flow.

import { supabaseAdmin } from "../supabase-admin";
import type {
  ExtractionType,
  NlExtractionRow,
  NlExtractionCorrectionRow,
  EvalCaseRow,
  EvalCaseJsonl,
  EvalInvariants,
  CorrectionType,
} from "./types";
import type { ExtractionV2, ConfirmedPlanV2 } from "../nl-types";

interface InsertExtractionInput {
  id: string;
  noteText: string;
  noteContext: string | null;
  todayDate: string;
  promptVersion: string;
  extractionType: ExtractionType;
  subjectPersonId: string | null;
  model: string;
  llmCallId: string | null;
  rawExtraction: ExtractionV2;
  directorySize: number | null;
  durationMs: number | null;
  promptTokens: number | null;
  cachedTokens: number | null;
  completionTokens: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertExtraction(input: InsertExtractionInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("nl_extractions").insert({
      id: input.id,
      note_text: input.noteText,
      note_context: input.noteContext,
      today_date: input.todayDate,
      prompt_version: input.promptVersion,
      extraction_type: input.extractionType,
      subject_person_id: input.subjectPersonId,
      model: input.model,
      llm_call_id: input.llmCallId,
      raw_extraction: input.rawExtraction,
      note_length_chars: input.noteText.length,
      directory_size: input.directorySize,
      duration_ms: input.durationMs,
      prompt_tokens: input.promptTokens,
      cached_tokens: input.cachedTokens,
      completion_tokens: input.completionTokens,
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error("insertExtraction failed", error);
  } catch (e) {
    console.error("insertExtraction unexpected", e);
  }
}

export async function updateExtractionApplied(
  extractionId: string,
  appliedPlan: ConfirmedPlanV2,
  affectedPersonIds: string[],
  affectedOrganizationIds: string[],
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("nl_extractions")
      .update({
        applied_plan: appliedPlan,
        applied_at: new Date().toISOString(),
        affected_person_ids: affectedPersonIds,
        affected_organization_ids: affectedOrganizationIds,
      })
      .eq("id", extractionId);
    if (error) console.error("updateExtractionApplied failed", error);
  } catch (e) {
    console.error("updateExtractionApplied unexpected", e);
  }
}

interface CorrectionInput {
  extractionId: string;
  correctionType: CorrectionType;
  before: unknown;
  after: unknown;
}

export async function insertCorrections(rows: CorrectionInput[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const { error } = await supabaseAdmin.from("nl_extraction_corrections").insert(
      rows.map((r) => ({
        extraction_id: r.extractionId,
        correction_type: r.correctionType,
        before: r.before,
        after: r.after,
      })),
    );
    if (error) console.error("insertCorrections failed", error);
  } catch (e) {
    console.error("insertCorrections unexpected", e);
  }
}

/**
 * Compares the raw LLM extraction against the user-confirmed plan and emits a
 * correction record per detectable difference. Best-effort; if any single
 * comparison crashes, we just skip it.
 */
export function diffPlan(
  raw: ExtractionV2,
  plan: ConfirmedPlanV2,
): Array<{ correctionType: CorrectionType; before: unknown; after: unknown }> {
  const out: Array<{ correctionType: CorrectionType; before: unknown; after: unknown }> = [];

  // mention_resolution / mention_dropped
  const mentionsByText = new Map<string, { candidate_ids: string[]; proposed_new: unknown }>();
  for (const o of raw.observations ?? []) {
    if (o.primary_mention) mentionsByText.set(o.primary_mention.text, o.primary_mention);
    for (const p of o.participants ?? []) if (p.mention) mentionsByText.set(p.mention.text, p.mention);
  }
  for (const u of raw.person_updates ?? []) {
    if (u.primary_mention) mentionsByText.set(u.primary_mention.text, u.primary_mention);
  }
  for (const [text, mention] of mentionsByText) {
    const resolution = plan.resolutions[text];
    if (!resolution) continue;
    if (resolution.kind === "skip") {
      out.push({ correctionType: "mention_dropped", before: mention, after: { kind: "skip" } });
      continue;
    }
    const llmTopId = mention.candidate_ids?.[0] ?? null;
    if (resolution.kind === "existing" && llmTopId !== resolution.personId) {
      out.push({
        correctionType: "mention_resolution",
        before: { candidate_ids: mention.candidate_ids, proposed_new: mention.proposed_new },
        after: { personId: resolution.personId },
      });
    } else if (resolution.kind === "new" && llmTopId) {
      out.push({
        correctionType: "mention_resolution",
        before: { candidate_ids: mention.candidate_ids },
        after: { kind: "new", person: resolution.person },
      });
    }
  }

  // supersede_rejected: hint present in raw, no superseded ids confirmed.
  for (let i = 0; i < (raw.observations ?? []).length; i++) {
    const o = raw.observations[i];
    if (!o.supersedes_hint) continue;
    const confirmed = plan.supersedes?.[i] ?? [];
    const candidateCount = o.supersedes_hint.candidate_observation_ids?.length ?? 0;
    if (candidateCount > 0 && confirmed.length === 0) {
      out.push({
        correctionType: "supersede_rejected",
        before: o.supersedes_hint,
        after: { confirmed: [] },
      });
    }
  }

  // observation_dropped: a raw observation index has no matching primary mention in plan.
  // Currently nl-input passes through all observations, so this rarely fires;
  // included for forward-compat with future preview drop-from-plan controls.
  const planPrimaryTexts = new Set(plan.observations.map((o) => o.primary_mention.text));
  for (const o of raw.observations ?? []) {
    if (!planPrimaryTexts.has(o.primary_mention.text)) {
      out.push({
        correctionType: "observation_dropped",
        before: { content: o.content, primary: o.primary_mention.text },
        after: null,
      });
    }
  }

  return out;
}

// ---------- list / get / case CRUD ----------

export interface ExtractionListFilters {
  from?: string;
  to?: string;
  applied?: "applied" | "discarded" | "all";
  model?: string;
  minObservations?: number;
  search?: string;
  limit?: number;
}

export async function listExtractions(
  filters: ExtractionListFilters = {},
): Promise<NlExtractionRow[]> {
  let q = supabaseAdmin
    .from("nl_extractions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  if (filters.applied === "applied") q = q.not("applied_at", "is", null);
  if (filters.applied === "discarded") q = q.is("applied_at", null);
  if (filters.model) q = q.eq("model", filters.model);
  if (filters.search) q = q.ilike("note_text", `%${filters.search}%`);
  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as NlExtractionRow[];
  if (filters.minObservations && filters.minObservations > 0) {
    rows = rows.filter(
      (r) => (r.raw_extraction?.observations?.length ?? 0) >= filters.minObservations!,
    );
  }
  return rows;
}

export async function getExtraction(id: string): Promise<NlExtractionRow | null> {
  const { data, error } = await supabaseAdmin
    .from("nl_extractions")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as NlExtractionRow;
}

export async function getCorrections(
  extractionId: string,
): Promise<NlExtractionCorrectionRow[]> {
  const { data, error } = await supabaseAdmin
    .from("nl_extraction_corrections")
    .select("*")
    .eq("extraction_id", extractionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as NlExtractionCorrectionRow[];
}

export async function createEvalCase(input: {
  extractionId: string;
  invariants: EvalInvariants;
  notes: string | null;
  tags: string[];
  priority: number;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("eval_cases")
    .insert({
      extraction_id: input.extractionId,
      invariants: input.invariants,
      notes: input.notes,
      tags: input.tags,
      priority: input.priority,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function listEvalCases(): Promise<EvalCaseRow[]> {
  const { data, error } = await supabaseAdmin
    .from("eval_cases")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EvalCaseRow[];
}

export async function getEvalCasesWithExtraction(
  ids: string[],
): Promise<Array<{ caseRow: EvalCaseRow; extraction: NlExtractionRow }>> {
  if (ids.length === 0) return [];
  const { data: cases, error } = await supabaseAdmin
    .from("eval_cases")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  const caseRows = (cases ?? []) as EvalCaseRow[];
  const extractionIds = caseRows.map((c) => c.extraction_id);
  const { data: exs, error: ee } = await supabaseAdmin
    .from("nl_extractions")
    .select("*")
    .in("id", extractionIds);
  if (ee) throw ee;
  const extractionById = new Map(
    ((exs ?? []) as NlExtractionRow[]).map((e) => [e.id, e]),
  );
  return caseRows
    .map((c) => {
      const ex = extractionById.get(c.extraction_id);
      return ex ? { caseRow: c, extraction: ex } : null;
    })
    .filter((x): x is { caseRow: EvalCaseRow; extraction: NlExtractionRow } => x !== null);
}

export async function markEvalCasesExported(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin
    .from("eval_cases")
    .update({ exported_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export function buildJsonlEntry(
  caseRow: EvalCaseRow,
  extraction: NlExtractionRow,
): EvalCaseJsonl {
  return {
    id: caseRow.id,
    source_extraction_id: extraction.id,
    note: extraction.note_text,
    note_context: extraction.note_context,
    expected: caseRow.invariants,
    tags: caseRow.tags,
    priority: caseRow.priority,
    notes: caseRow.notes,
  };
}

export function entriesToJsonl(entries: EvalCaseJsonl[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : "");
}
