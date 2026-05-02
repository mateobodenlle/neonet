"use server";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase-admin";
import { personFromRow, personToRow } from "./mappers";
import { mergePersonFields } from "./merge-people";
import type { Person } from "./types";

export interface ConnectionCandidate {
  id: string;
  source: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  linkedinUrl: string;
  linkedinHandle: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  status: "pending" | "accepted" | "rejected" | "merged";
  createdPersonId: string | null;
  mergedIntoPersonId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface CandidateRow {
  id: string;
  source: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  linkedin_url: string;
  linkedin_handle: string | null;
  email: string | null;
  company: string | null;
  position: string | null;
  connected_on: string | null;
  status: "pending" | "accepted" | "rejected" | "merged";
  created_person_id: string | null;
  merged_into_person_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function fromRow(r: CandidateRow): ConnectionCandidate {
  return {
    id: r.id,
    source: r.source,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    linkedinUrl: r.linkedin_url,
    linkedinHandle: r.linkedin_handle,
    email: r.email,
    company: r.company,
    position: r.position,
    connectedOn: r.connected_on,
    status: r.status,
    createdPersonId: r.created_person_id,
    mergedIntoPersonId: r.merged_into_person_id,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}

function check(error: unknown): void {
  if (!error) return;
  const e = error as { message?: string; code?: string };
  throw new Error(`Supabase error${e.code ? ` ${e.code}` : ""}: ${e.message ?? String(error)}`);
}

export async function listPendingCandidates(limit = 500): Promise<ConnectionCandidate[]> {
  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .select("*")
    .eq("status", "pending")
    .order("connected_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  check(error);
  return (data ?? []).map((r) => fromRow(r as CandidateRow));
}

export async function getCandidateStats(): Promise<{
  pending: number;
  accepted: number;
  rejected: number;
  merged: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .select("status");
  check(error);
  const counts = { pending: 0, accepted: 0, rejected: 0, merged: 0 };
  for (const r of data ?? []) {
    const s = (r as { status: keyof typeof counts }).status;
    if (s in counts) counts[s]++;
  }
  return counts;
}

function candidateToPerson(c: ConnectionCandidate): Person {
  const handles: Person["handles"] = {};
  if (c.email) handles.email = c.email;
  if (c.linkedinHandle) handles.linkedin = c.linkedinHandle;
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    fullName: c.fullName,
    aliases: [],
    role: c.position ?? undefined,
    company: c.company ?? undefined,
    category: "otro",
    temperature: "frio",
    tags: ["from-linkedin"],
    handles: Object.keys(handles).length ? handles : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function fetchCandidate(id: string): Promise<ConnectionCandidate> {
  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .select("*")
    .eq("id", id)
    .single();
  check(error);
  return fromRow(data as CandidateRow);
}

export async function acceptCandidateAction(id: string): Promise<{
  candidate: ConnectionCandidate;
  person: Person;
}> {
  const c = await fetchCandidate(id);
  if (c.status !== "pending") throw new Error(`candidate already ${c.status}`);
  const person = candidateToPerson(c);

  const { error: insErr } = await supabaseAdmin.from("people").insert(personToRow(person));
  check(insErr);

  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .update({
      status: "accepted",
      created_person_id: person.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  check(error);
  return { candidate: fromRow(data as CandidateRow), person };
}

export async function rejectCandidateAction(id: string): Promise<ConnectionCandidate> {
  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  check(error);
  return fromRow(data as CandidateRow);
}

export async function mergeCandidateAction(
  id: string,
  personId: string
): Promise<{ candidate: ConnectionCandidate; person: Person }> {
  const c = await fetchCandidate(id);
  if (c.status !== "pending") throw new Error(`candidate already ${c.status}`);

  const { data: pRow, error: pErr } = await supabaseAdmin
    .from("people")
    .select("*")
    .eq("id", personId)
    .single();
  check(pErr);
  const keep = personFromRow(pRow!);
  const dropAsPerson = candidateToPerson(c);
  const merged = mergePersonFields(keep, dropAsPerson);

  const { error: upErr } = await supabaseAdmin
    .from("people")
    .update(personToRow(merged))
    .eq("id", personId);
  check(upErr);

  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .update({
      status: "merged",
      merged_into_person_id: personId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  check(error);
  return { candidate: fromRow(data as CandidateRow), person: merged };
}

export async function undoCandidateAction(id: string): Promise<ConnectionCandidate> {
  const c = await fetchCandidate(id);
  if (c.status === "pending") return c;

  if (c.status === "accepted" && c.createdPersonId) {
    // Removes the Person and any FK-cascaded children. Since this only
    // happens immediately after accept, there shouldn't be related rows
    // yet, but the cascade is the same one used by deletePersonAction.
    const { error } = await supabaseAdmin
      .from("people")
      .delete()
      .eq("id", c.createdPersonId);
    check(error);
  }
  // Note: undoing 'merged' does NOT split the merged fields back out — that
  // information was destructively combined. Undo only clears the status so
  // the candidate re-enters review; the keep Person retains the merged data.

  const { data, error } = await supabaseAdmin
    .from("connection_candidates")
    .update({
      status: "pending",
      created_person_id: null,
      merged_into_person_id: null,
      reviewed_at: null,
    })
    .eq("id", id)
    .select("*")
    .single();
  check(error);
  return fromRow(data as CandidateRow);
}
