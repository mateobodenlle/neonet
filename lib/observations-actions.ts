"use server";

/**
 * Read-side server actions for the observations / profile UI on the
 * contact detail page. Kept apart from server-actions.ts to avoid bloating
 * that file during the legacy transition.
 */

import {
  getObservationsByPerson,
  getProfileByPerson,
} from "./repository";
import { supabaseAdmin } from "./supabase-admin";
import type { Observation, PersonProfile } from "./types";

export interface ObservationSnippet {
  content: string;
  observedAt: string;
}

/** Resolve a set of observation ids to their content + date, so the
 *  extraction preview can show what a supersede would replace instead of a
 *  bare truncated id. */
export async function fetchObservationSnippets(
  ids: string[]
): Promise<Record<string, ObservationSnippet>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("id, content, observed_at")
    .in("id", ids);
  if (error) throw error;
  const out: Record<string, ObservationSnippet> = {};
  for (const r of data ?? []) {
    out[r.id as string] = { content: r.content as string, observedAt: r.observed_at as string };
  }
  return out;
}

export async function fetchPersonObservations(
  personId: string,
  limit = 50
): Promise<Observation[]> {
  return getObservationsByPerson(personId, { limit });
}

export async function fetchPersonProfile(
  personId: string
): Promise<PersonProfile | null> {
  return getProfileByPerson(personId);
}
