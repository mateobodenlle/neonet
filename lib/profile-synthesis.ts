import "server-only";

/**
 * Profile synthesis layer.
 *
 *   synthesizeIncremental — old narrative + recent observations → new profile.
 *   synthesizeFullRebuild — drop the old narrative, regenerate from scratch.
 *   markProfileDirty       — re-export from server-actions for convenience.
 *   processDirtyProfiles   — batch job: pick stale dirty profiles, synthesize.
 *
 * Synthesis uses SYNTHESIS_MODEL (gpt-4o by default) — quality-critical
 * because the profile snippet is what every extraction call sees in the
 * directory.
 */

import { openai, SYNTHESIS_MODEL } from "./openai";
import { supabaseAdmin } from "./supabase-admin";
import { embedProfile } from "./embeddings";
import {
  PROFILE_SCHEMA,
  profileSystemPrompt,
  profileUserMessage,
  type SynthesisObservationLine,
} from "./profile-prompt";
import { personProfileFromRow } from "./mappers";
import type { PersonProfile } from "./types";

const FULL_REBUILD_DAYS = 60;
const FULL_REBUILD_RATIO = 0.5;
const MAX_OBSERVATIONS_FOR_INCREMENTAL = 80;

interface PersonContext {
  full_name: string;
  role: string | null;
  company: string | null;
  location: string | null;
  tags: string[];
}

interface SynthesisInputs {
  person: PersonContext;
  previousNarrative: string | null;
  observations: SynthesisObservationLine[];
  observationsCount: number;
}

async function loadPerson(personId: string): Promise<PersonContext> {
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("full_name, role, company, location, tags")
    .eq("id", personId)
    .single();
  if (error || !data) throw error ?? new Error(`Person not found: ${personId}`);
  return data as PersonContext;
}

async function loadCurrentProfile(personId: string): Promise<PersonProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data ? personProfileFromRow(data) : null;
}

async function loadObservations(
  personId: string,
  limit: number
): Promise<{ rows: SynthesisObservationLine[]; total: number }> {
  // Pull observation_ids the person participates in.
  const { data: parts, error: pe } = await supabaseAdmin
    .from("observation_participants")
    .select("observation_id")
    .eq("person_id", personId);
  if (pe) throw pe;
  const ids = (parts ?? []).map((r) => r.observation_id);
  if (ids.length === 0) return { rows: [], total: 0 };
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("id, content, observed_at, facets, source")
    .in("id", ids)
    .is("superseded_by", null)
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows: SynthesisObservationLine[] = (data ?? []).map((r) => {
    const facets = (r.facets ?? {}) as Record<string, unknown>;
    const facetType =
      typeof facets.type === "string" ? (facets.type as string) : null;
    return {
      id: r.id,
      observed_at: r.observed_at,
      content: r.content,
      facetType,
      source: r.source,
    };
  });
  return { rows, total: ids.length };
}

interface LLMOut {
  narrative: string;
  resolved_facts: { raw: string };
  recurring_themes: string[];
  active_threads: Array<{ title: string; status: string }>;
}

async function callSynthesis(inputs: SynthesisInputs): Promise<LLMOut> {
  const today = new Date().toISOString().slice(0, 10);
  const completion = await openai.chat.completions.create({
    model: SYNTHESIS_MODEL,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: PROFILE_SCHEMA as never },
    messages: [
      { role: "system", content: profileSystemPrompt(today) },
      {
        role: "user",
        content: profileUserMessage({
          fullName: inputs.person.full_name,
          basics: {
            role: inputs.person.role ?? undefined,
            company: inputs.person.company ?? undefined,
            location: inputs.person.location ?? undefined,
            tags: inputs.person.tags,
          },
          previousNarrative: inputs.previousNarrative,
          observations: inputs.observations,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty synthesis response");
  return JSON.parse(raw) as LLMOut;
}

function parseResolvedFacts(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function persistSynthesized(
  personId: string,
  out: LLMOut,
  observationsCount: number
): Promise<PersonProfile> {
  const now = new Date().toISOString();
  const row = {
    person_id: personId,
    narrative: out.narrative,
    resolved_facts: parseResolvedFacts(out.resolved_facts.raw),
    recurring_themes: out.recurring_themes,
    active_threads: out.active_threads,
    last_synthesized_at: now,
    observations_at_synthesis: observationsCount,
    dirty_since: null,
  };
  const { error } = await supabaseAdmin
    .from("person_profiles")
    .upsert(row, { onConflict: "person_id" });
  if (error) throw error;
  // Re-embed narrative + themes.
  try {
    await embedProfile(personId);
  } catch (e) {
    // Embedding failure shouldn't block the synthesis itself; log and move
    // on. The profile row is still written and queryable.
    console.error(`embedProfile failed for ${personId}:`, e);
  }
  const fresh = await loadCurrentProfile(personId);
  if (!fresh) throw new Error(`Profile not found after upsert: ${personId}`);
  return fresh;
}

export async function synthesizeIncremental(
  personId: string
): Promise<PersonProfile> {
  const [person, prev, obs] = await Promise.all([
    loadPerson(personId),
    loadCurrentProfile(personId),
    loadObservations(personId, MAX_OBSERVATIONS_FOR_INCREMENTAL),
  ]);
  const out = await callSynthesis({
    person,
    previousNarrative: prev?.narrative || null,
    observations: obs.rows,
    observationsCount: obs.total,
  });
  return persistSynthesized(personId, out, obs.total);
}

export async function synthesizeFullRebuild(
  personId: string
): Promise<PersonProfile> {
  const [person, obs] = await Promise.all([
    loadPerson(personId),
    loadObservations(personId, 1000),
  ]);
  const out = await callSynthesis({
    person,
    previousNarrative: null,
    observations: obs.rows,
    observationsCount: obs.total,
  });
  return persistSynthesized(personId, out, obs.total);
}

/** Heuristic: full rebuild if the profile is old or the observation set has
 *  grown a lot since the last synthesis. Otherwise incremental. */
export function shouldFullRebuild(
  profile: PersonProfile,
  currentObservations: number
): boolean {
  if (!profile.lastSynthesizedAt) return true;
  const ageMs = Date.now() - new Date(profile.lastSynthesizedAt).getTime();
  if (ageMs > FULL_REBUILD_DAYS * 24 * 3600 * 1000) return true;
  const baseline = Math.max(profile.observationsAtSynthesis, 1);
  const growth = (currentObservations - profile.observationsAtSynthesis) / baseline;
  return growth >= FULL_REBUILD_RATIO;
}

/**
 * Picks dirty profiles whose dirty_since is older than `staleSeconds`
 * (throttle to avoid regenerating mid-burst), synthesizes each. Sequential
 * to keep OpenAI rate-limit pressure low. Returns the count processed.
 */
export async function processDirtyProfiles(opts: {
  staleSeconds?: number;
  batchSize?: number;
  throttleMs?: number;
} = {}): Promise<{ processed: number; errors: Array<{ personId: string; error: string }> }> {
  const { staleSeconds = 600, batchSize = 5, throttleMs = 1000 } = opts;
  const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("*")
    .not("dirty_since", "is", null)
    .lt("dirty_since", cutoff)
    .order("dirty_since", { ascending: true })
    .limit(batchSize);
  if (error) throw error;
  const errors: Array<{ personId: string; error: string }> = [];
  let processed = 0;
  for (const r of data ?? []) {
    const profile = personProfileFromRow(r);
    try {
      // Decide rebuild vs incremental.
      const { count } = await countParticipations(profile.personId);
      const full = shouldFullRebuild(profile, count);
      if (full) await synthesizeFullRebuild(profile.personId);
      else await synthesizeIncremental(profile.personId);
      processed++;
    } catch (e) {
      errors.push({
        personId: profile.personId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (throttleMs > 0) await new Promise((r) => setTimeout(r, throttleMs));
  }
  return { processed, errors };
}

async function countParticipations(personId: string): Promise<{ count: number }> {
  const { count, error } = await supabaseAdmin
    .from("observation_participants")
    .select("*", { count: "exact", head: true })
    .eq("person_id", personId);
  if (error) throw error;
  return { count: count ?? 0 };
}
