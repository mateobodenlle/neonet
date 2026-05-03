import "server-only";
import { supabaseAdmin } from "./supabase-admin";
import {
  observationFromRow,
  observationParticipantFromRow,
  personProfileFromRow,
} from "./mappers";
import type {
  Database,
  Person,
  Encounter,
  Interaction,
  Event,
  Edge,
  Observation,
  ObservationParticipant,
  PersonProfile,
} from "./types";

/**
 * Legacy in-memory repository contract — preserved so older code paths still
 * type-check during the observations migration. New code should call the
 * server-side query functions exported below this interface.
 */
export interface Repository {
  getAll(): Database;
  getPerson(id: string): Person | undefined;
  getEvent(id: string): Event | undefined;
  getEncountersByPerson(personId: string): Encounter[];
  getInteractionsByPerson(personId: string): Interaction[];
  getEdgesForPerson(personId: string): Edge[];
  getPeopleByEvent(eventId: string): Person[];
  addPerson(p: Person): void;
  addEncounter(en: Encounter): void;
  addInteraction(i: Interaction): void;
}

// observations queries ---------------------------------------------------

export async function getObservationsByPerson(
  personId: string,
  opts: { limit?: number; includeSuperseded?: boolean } = {}
): Promise<Observation[]> {
  const { limit = 50, includeSuperseded = false } = opts;
  // Pull everything where the person is a participant — includes primary too
  // because we backfill role='primary' rows.
  const { data: parts, error: pe } = await supabaseAdmin
    .from("observation_participants")
    .select("observation_id")
    .eq("person_id", personId);
  if (pe) throw pe;
  const ids = (parts ?? []).map((r) => r.observation_id);
  if (ids.length === 0) return [];
  let q = supabaseAdmin
    .from("observations")
    .select("*")
    .in("id", ids)
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (!includeSuperseded) q = q.is("superseded_by", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(observationFromRow);
}

export async function getParticipantsByObservation(
  observationId: string
): Promise<ObservationParticipant[]> {
  const { data, error } = await supabaseAdmin
    .from("observation_participants")
    .select("*")
    .eq("observation_id", observationId);
  if (error) throw error;
  return (data ?? []).map(observationParticipantFromRow);
}

export async function getRecentObservationsForPersons(
  personIds: string[],
  opts: { perPerson?: number } = {}
): Promise<Observation[]> {
  const { perPerson = 5 } = opts;
  if (personIds.length === 0) return [];
  // Single round-trip: pull observation ids where any participant matches,
  // then sort + truncate per person in app code. For small N (mentions in
  // a note) this is cheaper than N round-trips.
  const { data: parts, error: pe } = await supabaseAdmin
    .from("observation_participants")
    .select("observation_id, person_id")
    .in("person_id", personIds);
  if (pe) throw pe;
  const allIds = Array.from(new Set((parts ?? []).map((r) => r.observation_id)));
  if (allIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("*")
    .in("id", allIds)
    .is("superseded_by", null)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  const byPerson = new Map<string, Observation[]>();
  for (const pid of personIds) byPerson.set(pid, []);
  const partsByObs = new Map<string, string[]>();
  for (const p of parts ?? []) {
    const arr = partsByObs.get(p.observation_id) ?? [];
    arr.push(p.person_id);
    partsByObs.set(p.observation_id, arr);
  }
  for (const r of data ?? []) {
    const obs = observationFromRow(r);
    for (const pid of partsByObs.get(obs.id) ?? []) {
      const bucket = byPerson.get(pid);
      if (bucket && bucket.length < perPerson) bucket.push(obs);
    }
  }
  // Flatten and dedupe by id while preserving ordering.
  const seen = new Set<string>();
  const out: Observation[] = [];
  for (const list of byPerson.values()) {
    for (const o of list) {
      if (!seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
  }
  return out;
}

export async function getProfileByPerson(
  personId: string
): Promise<PersonProfile | null> {
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw error;
  return data ? personProfileFromRow(data) : null;
}

export async function getDirtyProfiles(opts: {
  staleSeconds: number;
  limit: number;
}): Promise<PersonProfile[]> {
  const cutoff = new Date(Date.now() - opts.staleSeconds * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("person_profiles")
    .select("*")
    .not("dirty_since", "is", null)
    .lt("dirty_since", cutoff)
    .order("dirty_since", { ascending: true })
    .limit(opts.limit);
  if (error) throw error;
  return (data ?? []).map(personProfileFromRow);
}
