"use server";

import {
  listExtractions,
  getExtraction,
  getCorrections,
  createEvalCase,
  listEvalCases,
  getEvalCasesWithExtraction,
  markEvalCasesExported,
  buildJsonlEntry,
  entriesToJsonl,
  type ExtractionListFilters,
} from "@/lib/eval-builder/persistence";
import type { EvalInvariants } from "@/lib/eval-builder/types";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function listExtractionsAction(filters: ExtractionListFilters) {
  return listExtractions(filters);
}

export async function getExtractionAction(id: string) {
  const [extraction, corrections] = await Promise.all([
    getExtraction(id),
    getCorrections(id),
  ]);
  return { extraction, corrections };
}

export async function getDirectoryAction() {
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("id, full_name, company")
    .eq("archived", false)
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; full_name: string; company: string | null }>;
}

export async function createEvalCaseAction(input: {
  extractionId: string;
  invariants: EvalInvariants;
  notes: string | null;
  tags: string[];
  priority: number;
}) {
  return createEvalCase(input);
}

export async function listEvalCasesAction() {
  return listEvalCases();
}

export async function exportEvalCasesAction(ids: string[]): Promise<string> {
  const pairs = await getEvalCasesWithExtraction(ids);
  const entries = pairs.map(({ caseRow, extraction }) => buildJsonlEntry(caseRow, extraction));
  await markEvalCasesExported(ids);
  return entriesToJsonl(entries);
}
