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
  painPointFromRow,
  painPointToRow,
  promiseFromRow,
  promiseToRow,
  edgeFromRow,
  edgeToRow,
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
} from "./types";

const day = (s: string) => s.slice(0, 10);

function check(error: unknown): void {
  if (!error) return;
  const e = error as { message?: string; code?: string };
  throw new Error(`Supabase error${e.code ? ` ${e.code}` : ""}: ${e.message ?? String(error)}`);
}

// hydration ------------------------------------------------------------
export async function hydrate(): Promise<Database> {
  const [people, events, encounters, interactions, painPoints, promises, edges] = await Promise.all([
    supabaseAdmin.from("people").select("*"),
    supabaseAdmin.from("events").select("*"),
    supabaseAdmin.from("encounters").select("*"),
    supabaseAdmin.from("interactions").select("*"),
    supabaseAdmin.from("pain_points").select("*"),
    supabaseAdmin.from("promises").select("*"),
    supabaseAdmin.from("edges").select("*"),
  ]);
  check(people.error);
  check(events.error);
  check(encounters.error);
  check(interactions.error);
  check(painPoints.error);
  check(promises.error);
  check(edges.error);
  return {
    people: (people.data ?? []).map(personFromRow),
    events: (events.data ?? []).map(eventFromRow),
    encounters: (encounters.data ?? []).map(encounterFromRow),
    interactions: (interactions.data ?? []).map(interactionFromRow),
    painPoints: (painPoints.data ?? []).map(painPointFromRow),
    promises: (promises.data ?? []).map(promiseFromRow),
    edges: (edges.data ?? []).map(edgeFromRow),
  };
}

// people ---------------------------------------------------------------
export async function persistPerson(p: Person): Promise<void> {
  const { error } = await supabaseAdmin.from("people").upsert(personToRow(p), { onConflict: "id" });
  check(error);
}

export async function deletePersonAction(id: string): Promise<void> {
  // FK cascade handles encounters, interactions, pain_points, promises, edges.
  const { error } = await supabaseAdmin.from("people").delete().eq("id", id);
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
  if (related.painPoints.length) {
    const rows = related.painPoints.map(painPointToRow);
    const { error } = await supabaseAdmin.from("pain_points").insert(rows);
    check(error);
  }
  if (related.promises.length) {
    const rows = related.promises.map((p) => ({
      ...promiseToRow(p),
      due_date: p.dueDate ? day(p.dueDate) : null,
    }));
    const { error } = await supabaseAdmin.from("promises").insert(rows);
    check(error);
  }
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
export async function persistPainPoint(p: PainPoint): Promise<void> {
  const row = painPointToRow(p);
  const { error } = await supabaseAdmin.from("pain_points").upsert(row, { onConflict: "id" });
  check(error);
}

export async function deletePainPointAction(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("pain_points").delete().eq("id", id);
  check(error);
}

export async function restorePainPointAction(p: PainPoint): Promise<void> {
  await persistPainPoint(p);
}

// promises -------------------------------------------------------------
export async function persistPromise(p: DomainPromise): Promise<void> {
  const row = { ...promiseToRow(p), due_date: p.dueDate ? day(p.dueDate) : null };
  const { error } = await supabaseAdmin.from("promises").upsert(row, { onConflict: "id" });
  check(error);
}

export async function deletePromiseAction(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("promises").delete().eq("id", id);
  check(error);
}

export async function restorePromiseAction(p: DomainPromise): Promise<void> {
  await persistPromise(p);
}

export async function togglePromiseAction(id: string): Promise<void> {
  // Read-modify-write so the server is the source of truth on the flip.
  const { data, error } = await supabaseAdmin
    .from("promises")
    .select("done")
    .eq("id", id)
    .single();
  check(error);
  const done = !(data?.done ?? false);
  const { error: updateError } = await supabaseAdmin
    .from("promises")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  check(updateError);
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
