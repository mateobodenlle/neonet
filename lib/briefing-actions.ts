"use server";

/**
 * Pre-meeting briefing (README principle #4). Assembles, with NO extra LLM
 * call, the time-sensitive prep for a person from data that already exists:
 * last contact, open promises in both directions, unresolved pain points and
 * the synthesized active threads. getBriefing powers the per-person card;
 * getBriefingBoard powers the /briefing radar (who to prep for + upcoming
 * events). Cheap and instant — matching the "en 3 segundos, sin rebuscar"
 * goal.
 */

import { supabaseAdmin } from "./supabase-admin";
import { getObservationsByPerson, getProfileByPerson } from "./repository";
import { fetchPromiseObservations, type PromiseItem } from "./promise-actions";

const today = () => new Date().toISOString().slice(0, 10);

export interface BriefingPromise {
  observationId: string;
  content: string;
  direction: "yo-a-el" | "el-a-mi";
  dueDate?: string;
  overdue: boolean;
}

export interface BriefingThread {
  title: string;
  status: string | null;
}

export interface Briefing {
  personId: string;
  personName: string;
  company: string | null;
  role: string | null;
  lastContact: string | null;
  openPromisesByMe: BriefingPromise[];
  openPromisesToMe: BriefingPromise[];
  openPainPoints: { observationId: string; content: string; observedAt: string }[];
  activeThreads: BriefingThread[];
  nextStep: string | null;
  /** Nothing actionable AND no profile — the card can render a calm empty. */
  isEmpty: boolean;
}

function toBriefingPromise(p: PromiseItem, t: string): BriefingPromise {
  return {
    observationId: p.observationId,
    content: p.content,
    direction: p.direction,
    dueDate: p.dueDate,
    overdue: !!p.dueDate && p.dueDate < t,
  };
}

export async function getBriefing(personId: string): Promise<Briefing> {
  const t = today();
  const [promises, observations, profile, personRes] = await Promise.all([
    fetchPromiseObservations({ personId, includeDone: false }),
    getObservationsByPerson(personId, { limit: 50 }),
    getProfileByPerson(personId),
    supabaseAdmin
      .from("people")
      .select("full_name, company, role, next_step")
      .eq("id", personId)
      .maybeSingle(),
  ]);

  const openPromisesByMe = promises
    .filter((p) => p.direction === "yo-a-el")
    .map((p) => toBriefingPromise(p, t));
  const openPromisesToMe = promises
    .filter((p) => p.direction === "el-a-mi")
    .map((p) => toBriefingPromise(p, t));

  const openPainPoints = observations
    .filter((o) => (o.facets as Record<string, unknown>).type === "pain_point")
    .slice(0, 5)
    .map((o) => ({ observationId: o.id, content: o.content, observedAt: o.observedAt }));

  const activeThreads: BriefingThread[] = (profile?.activeThreads ?? [])
    .map((t2) => {
      const th = t2 as { title?: string; status?: string };
      return { title: th.title ?? "", status: th.status ?? null };
    })
    .filter((th) => th.title);

  const lastContact = observations[0]?.observedAt ?? null;
  const nextStep = personRes.data?.next_step ?? null;

  const isEmpty =
    openPromisesByMe.length === 0 &&
    openPromisesToMe.length === 0 &&
    openPainPoints.length === 0 &&
    activeThreads.length === 0 &&
    !nextStep;

  return {
    personId,
    personName: personRes.data?.full_name ?? "",
    company: personRes.data?.company ?? null,
    role: personRes.data?.role ?? null,
    lastContact,
    openPromisesByMe,
    openPromisesToMe,
    openPainPoints,
    activeThreads,
    nextStep,
    isEmpty,
  };
}

// ---- Board (the /briefing radar) -------------------------------------

export interface BriefingBoardPerson {
  personId: string;
  personName: string;
  company: string | null;
  lastContact: string | null;
  openByMe: number;
  openToMe: number;
  overdue: number;
  topPromise: string | null;
  nextStep: string | null;
  urgency: number;
}

export interface BriefingUpcomingEvent {
  id: string;
  name: string;
  date: string;
  location: string | null;
  people: { id: string; fullName: string }[];
}

export interface BriefingBoard {
  people: BriefingBoardPerson[];
  upcomingEvents: BriefingUpcomingEvent[];
}

interface PersonRow {
  id: string;
  full_name: string;
  company: string | null;
  next_step: string | null;
  last_observation_at: string | null;
  archived: boolean;
}

export async function getBriefingBoard(): Promise<BriefingBoard> {
  const t = today();

  // 1. People with open promises (counterparty = the promesa's primary).
  const promises = await fetchPromiseObservations({ includeDone: false, limit: 500 });
  const byPerson = new Map<string, PromiseItem[]>();
  for (const p of promises) {
    const arr = byPerson.get(p.primaryPersonId) ?? [];
    arr.push(p);
    byPerson.set(p.primaryPersonId, arr);
  }

  // 2. People with a next step queued.
  const nextStepRes = await supabaseAdmin
    .from("people")
    .select("id, full_name, company, next_step, last_observation_at, archived")
    .not("next_step", "is", null)
    .eq("archived", false);
  if (nextStepRes.error) throw nextStepRes.error;

  // Resolve the union of candidate people in one query.
  const candidateIds = Array.from(
    new Set([...byPerson.keys(), ...(nextStepRes.data ?? []).map((r) => r.id)]),
  );
  const peopleById = new Map<string, PersonRow>();
  for (const r of nextStepRes.data ?? []) peopleById.set(r.id, r as PersonRow);
  const missing = candidateIds.filter((id) => !peopleById.has(id));
  if (missing.length > 0) {
    const res = await supabaseAdmin
      .from("people")
      .select("id, full_name, company, next_step, last_observation_at, archived")
      .in("id", missing);
    if (res.error) throw res.error;
    for (const r of res.data ?? []) peopleById.set(r.id, r as PersonRow);
  }

  const people: BriefingBoardPerson[] = [];
  for (const id of candidateIds) {
    const row = peopleById.get(id);
    if (!row || row.archived) continue;
    const ps = byPerson.get(id) ?? [];
    const overdue = ps.filter((p) => !!p.dueDate && p.dueDate < t).length;
    const openByMe = ps.filter((p) => p.direction === "yo-a-el").length;
    const openToMe = ps.filter((p) => p.direction === "el-a-mi").length;
    const topPromise =
      ps.find((p) => !!p.dueDate && p.dueDate < t)?.content ?? ps[0]?.content ?? null;
    const urgency = overdue * 100 + (openByMe + openToMe) * 10 + (row.next_step ? 1 : 0);
    if (urgency === 0) continue; // nothing actionable
    people.push({
      personId: id,
      personName: row.full_name,
      company: row.company,
      lastContact: row.last_observation_at,
      openByMe,
      openToMe,
      overdue,
      topPromise,
      nextStep: row.next_step,
      urgency,
    });
  }
  people.sort((a, b) => b.urgency - a.urgency);

  // 3. Upcoming events + their known attendees (from prior encounters).
  const evRes = await supabaseAdmin
    .from("events")
    .select("id, name, date, location")
    .gte("date", t)
    .order("date", { ascending: true })
    .limit(6);
  if (evRes.error) throw evRes.error;
  const events = evRes.data ?? [];
  const upcomingEvents: BriefingUpcomingEvent[] = [];
  if (events.length > 0) {
    const eventIds = events.map((e) => e.id);
    const encRes = await supabaseAdmin
      .from("encounters")
      .select("event_id, person_id")
      .in("event_id", eventIds);
    if (encRes.error) throw encRes.error;
    const attendeeIds = Array.from(new Set((encRes.data ?? []).map((r) => r.person_id)));
    const namesRes = attendeeIds.length
      ? await supabaseAdmin.from("people").select("id, full_name").in("id", attendeeIds)
      : { data: [], error: null };
    if (namesRes.error) throw namesRes.error;
    const nameById = new Map((namesRes.data ?? []).map((r) => [r.id, r.full_name] as const));
    const peopleByEvent = new Map<string, { id: string; fullName: string }[]>();
    for (const r of encRes.data ?? []) {
      const arr = peopleByEvent.get(r.event_id) ?? [];
      if (!arr.some((x) => x.id === r.person_id)) {
        arr.push({ id: r.person_id, fullName: nameById.get(r.person_id) ?? "(desconocido)" });
      }
      peopleByEvent.set(r.event_id, arr);
    }
    for (const e of events) {
      upcomingEvents.push({
        id: e.id,
        name: e.name,
        date: e.date,
        location: e.location ?? null,
        people: peopleByEvent.get(e.id) ?? [],
      });
    }
  }

  return { people, upcomingEvents };
}
