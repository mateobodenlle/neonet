// Types shared between server and client for the internal eval builder.

import type { ExtractionV2, ConfirmedPlanV2 } from "../nl-types";

export type ExtractionType = "global" | "per-person";

export type CorrectionType =
  | "mention_resolution"
  | "mention_dropped"
  | "observation_dropped"
  | "observation_edited"
  | "facet_changed"
  | "event_dropped"
  | "supersede_rejected"
  | "other";

export interface NlExtractionRow {
  id: string;
  created_at: string;
  note_text: string;
  note_context: string | null;
  today_date: string;
  prompt_version: string;
  extraction_type: ExtractionType;
  subject_person_id: string | null;
  model: string;
  llm_call_id: string | null;
  raw_extraction: ExtractionV2;
  applied_plan: ConfirmedPlanV2 | null;
  applied_at: string | null;
  affected_person_ids: string[];
  affected_organization_ids: string[];
  note_length_chars: number;
  directory_size: number | null;
  duration_ms: number | null;
  prompt_tokens: number | null;
  cached_tokens: number | null;
  completion_tokens: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export interface NlExtractionCorrectionRow {
  id: string;
  extraction_id: string;
  correction_type: CorrectionType;
  before: unknown;
  after: unknown;
  created_at: string;
}

export interface FacetExpectation {
  type: string;
  filters?: Record<string, unknown>;
  min_count: number;
}

export interface EvalInvariants {
  observations_count: { min: number; max: number };
  must_mention_persons: string[];
  must_not_mention_persons: string[];
  must_mention_organizations: string[];
  must_have_facets: FacetExpectation[];
  warnings_count: { min: number; max: number };
}

export interface EvalRunSummary {
  run_at: string;
  prompt_version: string;
  model: string;
  passed: boolean;
  invariant_results: Array<{
    invariant: string;
    passed: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
  duration_ms?: number;
  cost_usd?: number;
}

export interface EvalCaseRow {
  id: string;
  extraction_id: string;
  invariants: EvalInvariants;
  notes: string | null;
  tags: string[];
  priority: number;
  eval_runs: EvalRunSummary[];
  created_at: string;
  exported_at: string | null;
}

// JSONL export shape consumed by scripts/eval-extraction.ts.
export interface EvalCaseJsonl {
  id: string;
  source_extraction_id: string;
  note: string;
  note_context: string | null;
  expected: EvalInvariants;
  tags: string[];
  priority: number;
  notes: string | null;
}
