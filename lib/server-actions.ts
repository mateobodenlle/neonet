"use server";

/**
 * Server actions for every CRUD operation against Supabase. The browser
 * never sees the service_role key — the store calls these via Next.js'
 * server-action transport.
 *
 * Each action mirrors a store mutation. The store keeps its optimistic
 * local update for instant UI; these actions are fire-and-forget from
 * the store's perspective, with errors surfacing as toasts.
 */

import { supabaseAdmin } from "./supabase-admin";
import {
  personFromRow,
  personToRow,
  eventFromRow,
  eventToRow,
  encounterFromRow,
  encounterToRow,
  interactionFromRow,
  interactionToRow,
  edgeFromRow,
  edgeToRow,
  observationToRow,
  observationParticipantToRow,
  personProfileToRow,
} from "./mappers";
import type {
  Person,
  Event as DomainEvent,
  Encounter,
  Interaction,
  PainPoint,
  Promise as DomainPromise,
  Edge,
  Database,
  Observation,
  ObservationParticipant,
  PersonProfile,
} from "./types";

const day = (s: string) => s.slice(0, 10);

function check(error: unknown): void {
  if (!error) return;
  const e = error as { message?: string; code?: string };
  throw new Error(`Supabase error${e.code ? ` ${e.code}` : ""}: ${e.message ?? String(error)}`);
}

// hydration ------------------------------------------------------------
//
// pain_points and promises were dropped in migration 0006. The store still
// has fields for them — they hydrate as empty arrays so legacy UI keeps
// rendering empty sections without runtime errors. A follow-up UI cleanup
// will remove those sections entirely.
export async function hydrate(): Promise<Database> {
  const [people, events, encounters, interactions, edges] = await Promise.all([
    supabaseAdmin.from("people").select("*"),
    supabaseAdmin.from("events").select("*"),
    supabaseAdmin.from("encounters").select("*"),
    supabaseAdmin.from("interactions").select("*"),
    supabaseAdmin.from("edges").select("*"),
  ]);
  check(people.error);
  check(events.error);
  check(encounters.error);
  check(interactions.error);
  check(edges.error);
  return {
    people: (people.data ?? []).map(personFromRow),
    events: (events.data ?? []).map(eventFromRow),
    encounters: (encounters.data ?? []).map(encounterFromRow),
    interactions: (interactions.data ?? []).map(interactionFromRow),
    painPoints: [],
    promises: [],
    edges: (edges.data ?? []).map(edgeFromRow),
  };
}

// people ---------------------------------------------------------------
export async function persistPerson(p: Person): Promise<void> {
  const { error } = await supabaseAdmin.from("people").upsert(personToRow(p), { onConflict: "id" });
  check(error);
}

export async function deletePersonAction(id: string): Promise<void> {
  // FK cascade handles encounters, interactions, observations, edges.
  const { error } = await supabaseAdmin.from("people").delete().eq("id", id);
  check(error);
}

export async function deletePersonsAction(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from("people").delete().in("id", ids);
  check(error);
}

export async function restorePersonAction(
  person: Person,
  related: {
    encounters: Encounter[];
    interactions: Interaction[];
    painPoints: PainPoint[];
    promises: DomainPromise[];
    edges: Edge[];
  }
): Promise<void> {
  // Insert in dependency order: person → encounters → interactions → pain_points / promises / edges.
  {
    const { error } = await supabaseAdmin.from("people").insert(personToRow(person));
    check(error);
  }
  if (related.encounters.length) {
    const rows = related.encounters.map((en) => ({ ...encounterToRow(en), date: day(en.date) }));
    const { error } = await supabaseAdmin.from("encounters").insert(rows);
    check(error);
  }
  if (related.interactions.length) {
    const rows = related.interactions.map((i) => ({ ...interactionToRow(i), date: day(i.date) }));
    const { error } = await supabaseAdmin.from("interactions").insert(rows);
    check(error);
  }
  // pain_points and promises tables dropped in 0006 — restore is a no-op
  // for those payloads. They live as observations now and follow the
  // observation FK cascade on people.
  if (related.edges.length) {
    const rows = related.edges.map(edgeToRow);
    const { error } = await supabaseAdmin.from("edges").insert(rows);
    check(error);
  }
}

export async function archivePersonAction(id: string, archived: boolean): Promise<void> {
  const { error } = await supabaseAdmin.from("people").update({ archived }).eq("id", id);
  check(error);
}

// events ---------------------------------------------------------------
export async function persistEvent(e: DomainEvent): Promise<void> {
  const row = { ...eventToRow(e), date: day(e.date), end_date: e.endDate ? day(e.endDate) : null };
  const { error } = await supabaseAdmin.from("events").upsert(row, { onConflict: "id" });
  check(error);
}

export async function deleteEventAction(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  check(error);
}

export async function restoreEventAction(e: DomainEvent): Promise<void> {
  await persistEvent(e);
}

// encounters -----------------------------------------------------------
export async function persistEncounter(en: Encounter, autoInteraction?: Interaction): Promise<void> {
  const row = { ...encounterToRow(en), date: day(en.date) };
  const { error } = await supabaseAdmin.from("encounters").upsert(row, { onConflict: "id" });
  check(error);
  if (autoInteraction) {
    const irow = { ...interactionToRow(autoInteraction), date: day(autoInteraction.date) };
    const { error: ie } = await supabaseAdmin.from("interactions").upsert(irow, { onConflict: "id" });
    check(ie);
  }
}

export async function updateEncounterAction(id: string, patch: Partial<Encounter>): Promise<void> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.eventId !== undefined) dbPatch.event_id = patch.eventId ?? null;
  if (patch.date !== undefined) dbPatch.date = day(patch.date);
  if (patch.location !== undefined) dbPatch.location = patch.location ?? null;
  if (patch.context !== undefined) dbPatch.context = patch.context ?? null;
  if (patch.introducedById !== undefined) dbPatch.introduced_by_id = patch.introducedById ?? null;
  if (Object.keys(dbPatch).length) {
    const { error } = await supabaseAdmin.from("encounters").update(dbPatch).eq("id", id);
    check(error);
  }
  // Propagate date/context to the linked interaction (matches store behaviour).
  const interactionPatch: Record<string, unknown> = {};
  if (patch.date !== undefined) interactionPatch.date = day(patch.date);
  if (patch.context !== undefined) interactionPatch.summary = patch.context ?? "Encuentro";
  if (Object.keys(interactionPatch).length) {
    const { error } = await supabaseAdmin
      .from("interactions")
      .update(interactionPatch)
      .eq("encounter_id", id);
    check(error);
  }
}

export async function deleteEncounterAction(id: string): Promise<void> {
  // FK cascade on interactions.encounter_id removes the linked interaction.
  const { error } = await supabaseAdmin.from("encounters").delete().eq("id", id);
  check(error);
}

export async function restoreEncounterAction(
  encounter: Encounter,
  interaction?: Interaction
): Promise<void> {
  await persistEncounter(encounter, interaction);
}

// interactions ---------------------------------------------------------
export async function persistInteraction(i: Interaction): Promise<void> {
  const row = { ...interactionToRow(i), date: day(i.date) };
  const { error } = await supabaseAdmin.from("interactions").upsert(row, { onConflict: "id" });
  check(error);
}

export async function deleteInteractionAction(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("interactions").delete().eq("id", id);
  check(error);
}

export async function restoreInteractionAction(i: Interaction): Promise<void> {
  await persistInteraction(i);
}

// pain_points ----------------------------------------------------------
// Tables dropped in migration 0006. The functions below remain so legacy
// callers (UI dialogs that haven't been excised yet) keep type-checking;
// they no-op at runtime. New code emits observations with
// facets.type='pain_point' / 'promesa' instead.
export async function persistPainPoint(_p: PainPoint): Promise<void> {
  void _p;
}
export async function deletePainPointAction(_id: string): Promise<void> {
  void _id;
}
export async function restorePainPointAction(_p: PainPoint): Promise<void> {
  void _p;
}

// promises -------------------------------------------------------------
export async function persistPromise(_p: DomainPromise): Promise<void> {
  void _p;
}
export async function deletePromiseAction(_id: string): Promise<void> {
  void _id;
}
export async function restorePromiseAction(_p: DomainPromise): Promise<void> {
  void _p;
}
/**
 * Toggles the `done` facet on the observation that backs a legacy
 * promise id. Promises were migrated as observations with
 * id = `legacy-pr-<originalId>` and facets.type='promesa'. New promises
 * (created via NL v2) share the same shape.
 */
export async function togglePromiseAction(id: string): Promise<void> {
  // Try matching by both legacy-mapped id and direct observation id.
  const candidates = [id, `legacy-pr-${id}`];
  const { data, error } = await supabaseAdmin
    .from("observations")
    .select("id, facets")
    .in("id", candidates)
    .limit(1);
  check(error);
  const row = data?.[0];
  if (!row) return;
  const facets = (row.facets ?? {}) as Record<string, unknown>;
  const done = !facets.done;
  const next: Record<string, unknown> = { ...facets, done };
  if (done) next.completed_at = new Date().toISOString();
  else delete next.completed_at;
  const { error: ue } = await supabaseAdmin
    .from("observations")
    .update({ facets: next })
    .eq("id", row.id);
  check(ue);
}

// edges ----------------------------------------------------------------
export async function persistEdge(e: Edge): Promise<void> {
  const row = edgeToRow(e);
  const { error } = await supabaseAdmin.from("edges").upsert(row, { onConflict: "id" });
  check(error);
}

export async function deleteEdgeAction(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("edges").delete().eq("id", id);
  check(error);
}

export async function restoreEdgeAction(e: Edge): Promise<void> {
  await persistEdge(e);
}

// observations ---------------------------------------------------------
export async function persistObservation(o: Observation): Promise<void> {
  const row = { ...observationToRow(o), observed_at: day(o.observedAt) };
  const { error } = await supabaseAdmin
    .from("observations")
    .upsert(row, { onConflict: "id" });
  check(error);
}

export async function persistObservationParticipants(
  participants: ObservationParticipant[]
): Promise<void> {
  if (participants.length === 0) return;
  const rows = participants.map(observationParticipantToRow);
  const { error } = await supabaseAdmin
    .from("observation_participants")
    .upsert(rows, { onConflict: "observation_id,person_id,role" });
  check(error);
}

export async function deleteObservationAction(id: string): Promise<void> {
  // FK cascade removes observation_participants.
  const { error } = await supabaseAdmin.from("observations").delete().eq("id", id);
  check(error);
}

export async function applySupersede(
  oldId: string,
  newId: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("observations")
    .update({ superseded_by: newId })
    .eq("id", oldId);
  check(error);
}

export async function persistProfile(p: PersonProfile): Promise<void> {
  const row = personProfileToRow(p);
  const { error } = await supabaseAdmin
    .from("person_profiles")
    .upsert(row, { onConflict: "person_id" });
  check(error);
}

export async function markPersonProfileDirty(personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;
  const now = new Date().toISOString();
  // Use upsert semantics: insert empty profile if missing, set dirty_since
  // unconditionally so a dormant profile becomes dirty too.
  const rows = personIds.map((id) => ({
    person_id: id,
    dirty_since: now,
  }));
  const { error } = await supabaseAdmin
    .from("person_profiles")
    .upsert(rows, { onConflict: "person_id" });
  check(error);
  // upsert won't overwrite existing dirty_since with the new value if onConflict
  // does merge — Supabase merges all provided columns, so dirty_since is
  // updated. Confirmed via docs (postgrest upsert = ON CONFLICT DO UPDATE SET
  // every provided column).
}
