import "server-only";

/**
 * Vector embeddings layer.
 *
 *   embedText        — one-shot text → vector (raw OpenAI call)
 *   embedObservation — generates and persists the embedding for an observation
 *   embedProfile     — same for person_profiles
 *   searchObservations / searchProfiles — cosine-distance KNN via pgvector.
 *
 * Model is read from EMBEDDING_MODEL (text-embedding-3-small by default,
 * 1536 dims). Storing the model alongside each row lets us bulk-reembed
 * later without losing track of which vectors are stale.
 */

import { openai, EMBEDDING_MODEL } from "./openai";
import { supabaseAdmin } from "./supabase-admin";
import { observationFromRow, personProfileFromRow, vectorToWire } from "./mappers";
import type { Observation, PersonProfile } from "./types";

export interface EmbedResult {
  vector: number[];
  model: string;
}

export async function embedText(text: string): Promise<EmbedResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("embedText: empty input");
  const r = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });
  const vec = r.data[0]?.embedding;
  if (!vec) throw new Error("embedText: empty response");
  return { vector: vec, model: EMBEDDING_MODEL };
}

export async function embedTexts(texts: string[]): Promise<EmbedResult[]> {
  if (texts.length === 0) return [];
  const r = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return r.data.map((d) => ({ vector: d.embedding, model: EMBEDDING_MODEL }));
}

/**
 * Generates and persists the embedding for an observation. Idempotent —
 * overwrites whatever was there. Pass the observation's content + facet
 * type as input so the embedding picks up structural signal too.
 */
export async function embedObservation(observationId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("id, content, facets")
    .eq("id", observationId)
    .single();
  if (error || !data) throw error ?? new Error(`Observation not found: ${observationId}`);
  const facetType =
    typeof data.facets === "object" && data.facets && "type" in data.facets
      ? String((data.facets as Record<string, unknown>).type)
      : null;
  const input = facetType ? `[${facetType}] ${data.content}` : data.content;
  const { vector, model } = await embedText(input);
  const { error: ue } = await supabaseAdmin
    .from("observations")
    .update({ embedding: vectorToWire(vector), embedding_model: model })
    .eq("id", observationId);
  if (ue) throw ue;
}

export async function embedProfile(personId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("person_id, narrative, recurring_themes")
    .eq("person_id", personId)
    .single();
  if (error || !data) throw error ?? new Error(`Profile not found: ${personId}`);
  const themes = (data.recurring_themes ?? []).join(", ");
  const input = themes
    ? `${data.narrative}\n\nThemes: ${themes}`
    : data.narrative;
  if (!input.trim()) return; // empty profile, nothing to embed
  const { vector, model } = await embedText(input);
  const { error: ue } = await supabaseAdmin
    .from("person_profiles")
    .update({ embedding: vectorToWire(vector), embedding_model: model })
    .eq("person_id", personId);
  if (ue) throw ue;
}

export interface ObservationHit {
  observation: Observation;
  score: number; // 1 - cosine_distance, higher is more similar
}

export interface ProfileHit {
  profile: PersonProfile;
  score: number;
}

/**
 * Semantic search over observations. Optional personId restricts to
 * observations the person participates in. minScore filters out weak hits.
 */
export async function searchObservations(
  query: string,
  opts: { limit?: number; personId?: string; minScore?: number } = {}
): Promise<ObservationHit[]> {
  const { limit = 10, personId, minScore = 0 } = opts;
  const { vector } = await embedText(query);
  const wire = vectorToWire(vector);
  // pgvector's `<=>` is cosine distance (0 = identical). We expose 1 - dist
  // as score so caller-side thresholds feel natural.
  const { data, error } = await supabaseAdmin.rpc("search_observations", {
    query_embedding: wire,
    match_limit: limit,
    filter_person_id: personId ?? null,
    min_score: minScore,
  });
  if (error) {
    // RPC missing — fall back to client-side ordering on a small sample.
    const { data: rows, error: re } = await supabaseAdmin
      .from("observations")
      .select("*")
      .is("superseded_by", null)
      .not("embedding", "is", null)
      .limit(500);
    if (re) throw re;
    const qv = vector;
    const hits = (rows ?? [])
      .map((r) => {
        const obs = observationFromRow(r);
        const ev = obs.embedding;
        if (!ev) return null;
        const score = cosineSim(qv, ev);
        return { observation: obs, score };
      })
      .filter((h): h is ObservationHit => h !== null && h.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return personId
      ? await filterByParticipant(hits, personId)
      : hits;
  }
  return (data ?? []).map((row: { observation: unknown; score: number }) => ({
    observation: observationFromRow(row.observation as never),
    score: row.score,
  }));
}

export async function searchProfiles(
  query: string,
  opts: { limit?: number; minScore?: number } = {}
): Promise<ProfileHit[]> {
  const { limit = 10, minScore = 0 } = opts;
  const { vector } = await embedText(query);
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("*")
    .not("embedding", "is", null)
    .limit(500);
  if (error) throw error;
  const hits = (data ?? [])
    .map((r) => {
      const profile = personProfileFromRow(r);
      const ev = profile.embedding;
      if (!ev) return null;
      const score = cosineSim(vector, ev);
      return { profile, score };
    })
    .filter((h): h is ProfileHit => h !== null && h.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return hits;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function filterByParticipant(
  hits: ObservationHit[],
  personId: string
): Promise<ObservationHit[]> {
  if (hits.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("observation_participants")
    .select("observation_id")
    .eq("person_id", personId)
    .in(
      "observation_id",
      hits.map((h) => h.observation.id)
    );
  if (error) throw error;
  const allowed = new Set((data ?? []).map((r) => r.observation_id));
  return hits.filter((h) => allowed.has(h.observation.id));
}
