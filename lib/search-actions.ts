"use server";

/**
 * Semantic ("ask the memory") search over observations. This is the user
 * surface for README principle #5 — a natural-language question like
 * "¿quién mencionó problemas de pricing?" resolved against the observation
 * embeddings, grouped by person. Backed by the existing search_observations
 * pgvector RPC (lib/embeddings.ts), which until now had no caller.
 */

import { searchObservations } from "./embeddings";
import { supabaseAdmin } from "./supabase-admin";

export interface SemanticHit {
  observationId: string;
  content: string;
  observedAt: string;
  facetType: string | null;
  score: number;
}

export interface SemanticPersonResult {
  personId: string;
  personName: string;
  company: string | null;
  hits: SemanticHit[];
  topScore: number;
}

export async function semanticSearch(query: string): Promise<SemanticPersonResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const hits = await searchObservations(q, { limit: 16, minScore: 0.15 });
  if (hits.length === 0) return [];

  const personIds = Array.from(
    new Set(hits.map((h) => h.observation.primaryPersonId).filter(Boolean)),
  );
  const { data: peopleRows, error } = await supabaseAdmin
    .from("people")
    .select("id, full_name, company")
    .in("id", personIds);
  if (error) throw error;
  const personById = new Map((peopleRows ?? []).map((r) => [r.id, r] as const));

  const byPerson = new Map<string, SemanticPersonResult>();
  for (const h of hits) {
    const pid = h.observation.primaryPersonId;
    const pr = personById.get(pid);
    if (!pr) continue; // person archived/deleted — skip orphan hit
    let g = byPerson.get(pid);
    if (!g) {
      g = { personId: pid, personName: pr.full_name, company: pr.company ?? null, hits: [], topScore: 0 };
      byPerson.set(pid, g);
    }
    const ft = h.observation.facets?.type;
    g.hits.push({
      observationId: h.observation.id,
      content: h.observation.content,
      observedAt: h.observation.observedAt,
      facetType: typeof ft === "string" ? ft : null,
      score: h.score,
    });
    g.topScore = Math.max(g.topScore, h.score);
  }

  return Array.from(byPerson.values())
    .map((g) => ({ ...g, hits: g.hits.slice(0, 3) }))
    .sort((a, b) => b.topScore - a.topScore);
}
