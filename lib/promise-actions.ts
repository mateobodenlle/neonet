"use server";

/**
 * Server actions for promesa observations — the user-facing "Pendientes"
 * feature. A promesa is just an Observation with facets.type='promesa';
 * "done" is a flag inside facets, toggled by superseding the row with a
 * fresh observation that flips the flag (append-only, see lib/observations.ts).
 */

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import {
  observationFromRow,
  observationParticipantFromRow,
  observationToRow,
  observationParticipantToRow,
} from "./mappers";
import {
  applySupersede,
  markPersonProfileDirty,
} from "./server-actions";
import type {
  Observation,
  ObservationParticipant,
  ObservationRole,
} from "./types";

export interface PromiseItem {
  observationId: string;
  content: string;
  direction: "yo-a-el" | "el-a-mi";
  dueDate?: string;
  done: boolean;
  completedAt?: string;
  observedAt: string;
  createdAt: string;
  primaryPersonId: string;
  participants: Array<{
    personId: string;
    fullName: string;
    role: ObservationRole;
  }>;
}

interface ListOpts {
  includeDone?: boolean;
  /** If set, restrict to promesas where this person participates in any role. */
  personId?: string;
  limit?: number;
}

function readPromesa(o: Observation): {
  direction: "yo-a-el" | "el-a-mi";
  dueDate?: string;
  done: boolean;
  completedAt?: string;
} | null {
  const f = o.facets as Record<string, unknown>;
  if (f.type !== "promesa") return null;
  const dir = f.direction === "el-a-mi" ? "el-a-mi" : "yo-a-el";
  const dueDate = typeof f.due_date === "string" ? f.due_date : undefined;
  const done = f.done === true;
  const completedAt =
    typeof f.completed_at === "string" ? f.completed_at : undefined;
  return { direction: dir, dueDate, done, completedAt };
}

async function hydrateParticipants(
  observationIds: string[]
): Promise<Map<string, PromiseItem["participants"]>> {
  if (observationIds.length === 0) return new Map();
  const { data: parts, error: pe } = await supabaseAdmin
    .from("observation_participants")
    .select("observation_id, person_id, role")
    .in("observation_id", observationIds);
  if (pe) throw pe;
  const personIds = Array.from(
    new Set((parts ?? []).map((p) => p.person_id))
  );
  const { data: people, error: peopleErr } = await supabaseAdmin
    .from("people")
    .select("id, full_name")
    .in("id", personIds);
  if (peopleErr) throw peopleErr;
  const nameById = new Map<string, string>();
  for (const p of people ?? []) nameById.set(p.id, p.full_name);
  const byObs = new Map<string, PromiseItem["participants"]>();
  for (const p of parts ?? []) {
    const list = byObs.get(p.observation_id) ?? [];
    list.push({
      personId: p.person_id,
      fullName: nameById.get(p.person_id) ?? "(desconocido)",
      role: p.role as ObservationRole,
    });
    byObs.set(p.observation_id, list);
  }
  return byObs;
}

export async function fetchPromiseObservations(
  opts: ListOpts = {}
): Promise<PromiseItem[]> {
  const { includeDone = false, personId, limit = 200 } = opts;

  let observationIds: string[] | null = null;
  if (personId) {
    const { data: parts, error: pe } = await supabaseAdmin
      .from("observation_participants")
      .select("observation_id")
      .eq("person_id", personId);
    if (pe) throw pe;
    observationIds = Array.from(
      new Set((parts ?? []).map((r) => r.observation_id))
    );
    if (observationIds.length === 0) return [];
  }

  let q = supabaseAdmin
    .from("observations")
    .select("*")
    .is("superseded_by", null)
    .contains("facets", { type: "promesa" })
    .order("observed_at", { ascending: false })
    .limit(limit);
  if (observationIds) q = q.in("id", observationIds);

  const { data, error } = await q;
  if (error) throw error;

  const obs = (data ?? []).map(observationFromRow);
  const filtered: Array<{ obs: Observation; parsed: NonNullable<ReturnType<typeof readPromesa>> }> =
    [];
  for (const o of obs) {
    const parsed = readPromesa(o);
    if (!parsed) continue;
    if (parsed.done && !includeDone) continue;
    filtered.push({ obs: o, parsed });
  }

  const partsByObs = await hydrateParticipants(filtered.map((x) => x.obs.id));

  return filtered.map(({ obs: o, parsed }) => ({
    observationId: o.id,
    content: o.content,
    direction: parsed.direction,
    dueDate: parsed.dueDate,
    done: parsed.done,
    completedAt: parsed.completedAt,
    observedAt: o.observedAt,
    createdAt: o.createdAt,
    primaryPersonId: o.primaryPersonId,
    participants: partsByObs.get(o.id) ?? [],
  }));
}

async function loadObservation(id: string): Promise<Observation> {
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return observationFromRow(data);
}

async function loadParticipants(
  observationId: string
): Promise<ObservationParticipant[]> {
  const { data, error } = await supabaseAdmin
    .from("observation_participants")
    .select("*")
    .eq("observation_id", observationId);
  if (error) throw error;
  return (data ?? []).map(observationParticipantFromRow);
}

const nowIso = () => new Date().toISOString();

/**
 * Toggle the done flag on a promesa observation. Append-only: a new
 * observation is inserted with the same content/participants but flipped
 * `done`/`completed_at`, and the original is marked superseded_by the new one.
 * Returns the new observation id so the UI can keep referencing the live row.
 */
export async function togglePromiseDone(
  observationId: string,
  done: boolean
): Promise<string> {
  const old = await loadObservation(observationId);
  const oldFacets = old.facets as Record<string, unknown>;
  if (oldFacets.type !== "promesa") {
    throw new Error(`observation ${observationId} is not a promesa`);
  }
  const participants = await loadParticipants(observationId);

  const newId = randomUUID();
  const newFacets: Record<string, unknown> = {
    ...oldFacets,
    done,
  };
  if (done) newFacets.completed_at = nowIso();
  else delete newFacets.completed_at;

  const newObs: Observation = {
    id: newId,
    primaryPersonId: old.primaryPersonId,
    content: old.content,
    observedAt: old.observedAt,
    source: old.source,
    tags: old.tags,
    facets: newFacets,
    createdAt: nowIso(),
  };

  const row = { ...observationToRow(newObs), observed_at: old.observedAt.slice(0, 10) };
  const { error: insErr } = await supabaseAdmin
    .from("observations")
    .insert(row);
  if (insErr) throw insErr;

  const newParticipants = participants.map((p) => ({
    ...p,
    observationId: newId,
  }));
  if (newParticipants.length > 0) {
    const { error: pErr } = await supabaseAdmin
      .from("observation_participants")
      .insert(newParticipants.map(observationParticipantToRow));
    if (pErr) throw pErr;
  }

  await applySupersede(observationId, newId);
  await markPersonProfileDirty(participants.map((p) => p.personId));

  return newId;
}

/**
 * Edit a promesa's description / direction / due date. Same supersede pattern
 * as toggle: produces a new observation that replaces the old one.
 */
export async function editPromiseObservation(
  observationId: string,
  patch: {
    content?: string;
    direction?: "yo-a-el" | "el-a-mi";
    dueDate?: string | null;
  }
): Promise<string> {
  const old = await loadObservation(observationId);
  const oldFacets = old.facets as Record<string, unknown>;
  if (oldFacets.type !== "promesa") {
    throw new Error(`observation ${observationId} is not a promesa`);
  }
  const participants = await loadParticipants(observationId);

  const newFacets: Record<string, unknown> = { ...oldFacets };
  if (patch.direction) newFacets.direction = patch.direction;
  if (patch.dueDate === null) delete newFacets.due_date;
  else if (typeof patch.dueDate === "string") newFacets.due_date = patch.dueDate;

  const newId = randomUUID();
  const newObs: Observation = {
    id: newId,
    primaryPersonId: old.primaryPersonId,
    content: patch.content?.trim() || old.content,
    observedAt: old.observedAt,
    source: old.source,
    tags: old.tags,
    facets: newFacets,
    createdAt: nowIso(),
  };

  const row = { ...observationToRow(newObs), observed_at: old.observedAt.slice(0, 10) };
  const { error: insErr } = await supabaseAdmin
    .from("observations")
    .insert(row);
  if (insErr) throw insErr;

  const newParticipants = participants.map((p) => ({
    ...p,
    observationId: newId,
  }));
  if (newParticipants.length > 0) {
    const { error: pErr } = await supabaseAdmin
      .from("observation_participants")
      .insert(newParticipants.map(observationParticipantToRow));
    if (pErr) throw pErr;
  }

  await applySupersede(observationId, newId);
  await markPersonProfileDirty(participants.map((p) => p.personId));

  return newId;
}

/**
 * Hard-delete a promesa observation (and its participants via FK cascade).
 * Used by the row trash menu in the Pendientes UI.
 */
export async function deletePromiseObservation(
  observationId: string
): Promise<void> {
  const participants = await loadParticipants(observationId);
  const { error } = await supabaseAdmin
    .from("observations")
    .delete()
    .eq("id", observationId);
  if (error) throw error;
  await markPersonProfileDirty(participants.map((p) => p.personId));
}

/**
 * Manually create a new promesa observation (from the AddPromiseDialog).
 * `alsoPersonIds` get role='promise_target' alongside the primary, mirroring
 * what the v2 NL extractor emits.
 */
export async function createPromiseObservation(input: {
  primaryPersonId: string;
  alsoPersonIds?: string[];
  content: string;
  direction: "yo-a-el" | "el-a-mi";
  dueDate?: string;
  observedAt?: string;
}): Promise<string> {
  const observedAt = (input.observedAt ?? nowIso()).slice(0, 10);
  const id = randomUUID();
  const facets: Record<string, unknown> = {
    type: "promesa",
    direction: input.direction,
  };
  if (input.dueDate) facets.due_date = input.dueDate;

  const obs: Observation = {
    id,
    primaryPersonId: input.primaryPersonId,
    content: input.content.trim(),
    observedAt,
    source: "manual",
    tags: [],
    facets,
    createdAt: nowIso(),
  };

  const row = { ...observationToRow(obs), observed_at: observedAt };
  const { error: insErr } = await supabaseAdmin
    .from("observations")
    .insert(row);
  if (insErr) throw insErr;

  const seen = new Set<string>();
  const participants: ObservationParticipant[] = [];
  const push = (personId: string, role: ObservationRole) => {
    const k = `${personId}|${role}`;
    if (seen.has(k)) return;
    seen.add(k);
    participants.push({ observationId: id, personId, role });
  };
  push(input.primaryPersonId, "primary");
  for (const pid of input.alsoPersonIds ?? []) push(pid, "promise_target");

  if (participants.length > 0) {
    const { error: pErr } = await supabaseAdmin
      .from("observation_participants")
      .insert(participants.map(observationParticipantToRow));
    if (pErr) throw pErr;
  }

  await markPersonProfileDirty(participants.map((p) => p.personId));

  return id;
}
