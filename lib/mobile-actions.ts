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

/** Search the directory so the mobile review can resolve a mention to ANY
 *  existing contact (not just the LLM's candidates) and avoid duplicates. */
export async function searchDirectory(query: string): Promise<MobilePerson[]> {
  const safe = query.replace(/[%,()*]/g, " ").trim();
  if (safe.length < 2) return [];
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("id, full_name, role, company")
    .eq("archived", false)
    .or(`full_name.ilike.%${safe}%,company.ilike.%${safe}%,role.ilike.%${safe}%`)
    .limit(8);
  if (error) throw error;
  return (data ?? []) as MobilePerson[];
}

/** Resolve observation ids to content for the supersede preview. */
export async function loadObservationSnippets(
  ids: string[],
): Promise<Record<string, { content: string; observedAt: string }>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("id, content, observed_at")
    .in("id", ids);
  if (error) throw error;
  const out: Record<string, { content: string; observedAt: string }> = {};
  for (const r of data ?? []) {
    out[r.id as string] = { content: r.content as string, observedAt: r.observed_at as string };
  }
  return out;
}

