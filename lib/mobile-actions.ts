"use server";

import { extractFromNoteV2, applyPlanV2, type ApplyResultV2 } from "./nl-actions-v2";
import { getExtractionById, markExtractionAsDiscarded } from "./repository";
import { supabaseAdmin } from "./supabase-admin";
import type { ConfirmedPlanV2 } from "./nl-types";
import type { MobilePerson } from "./mobile-types";

export async function processNoteAsync(text: string): Promise<{ extractionId: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const { extractionId } = await extractFromNoteV2(text, today);
  return { extractionId };
}

export async function applyExtraction(
  extractionId: string,
  plan: ConfirmedPlanV2,
): Promise<ApplyResultV2> {
  const row = await getExtractionById(extractionId);
  if (!row) throw new Error("Extracción no encontrada");
  if (row.applied_at) throw new Error("Esta extracción ya está resuelta");
  return applyPlanV2(plan, { extractionId, rawExtraction: row.raw_extraction });
}

export async function discardExtraction(extractionId: string): Promise<void> {
  await markExtractionAsDiscarded(extractionId);
}

export async function getPendingCount(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("nl_extractions")
    .select("id", { count: "exact", head: true })
    .is("applied_plan", null);
  if (error) throw error;
  return count ?? 0;
}

export async function loadPeopleByIds(ids: string[]): Promise<MobilePerson[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("id, full_name, role, company")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as MobilePerson[];
}

