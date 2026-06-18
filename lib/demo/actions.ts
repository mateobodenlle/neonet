"use server";

import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { DEMO_COOKIE, verifyDemoToken } from "./auth";
import { getOrCreateSession, getSession } from "./store";
import { extractFromNoteDemo } from "./nl-extract";
import { consume } from "./rate-limit";
import type {
  DemoApplyResult,
  DemoExtractionDetail,
  DemoPendingItem,
  DemoSessionState,
} from "./types";
import type { Observation, ObservationParticipant, Person } from "@/lib/types";
import type { ConfirmedPlanV2 } from "@/lib/nl-types";
import type { MobilePerson } from "@/lib/mobile-types";
import type { Edge, Encounter, Event } from "@/lib/types";

async function requireSession(): Promise<DemoSessionState> {
  const token = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!token) throw new Error("Sesión demo no iniciada");
  const payload = await verifyDemoToken(token);
  if (!payload?.sid) throw new Error("Sesión demo inválida");
  return getOrCreateSession(payload.sid);
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseFacetsRaw(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// ---------- public actions ----------

export async function processNoteDemo(text: string): Promise<{ extractionId: string }> {
  const state = await requireSession();
  const ip = await clientIp();
  const rl = consume(ip);
  if (!rl.ok) {
    if (rl.reason === "day") {
      throw new Error("Has alcanzado el límite diario de la demo. Vuelve mañana.");
    }
    throw new Error(
      `Has hecho demasiadas extracciones en poco tiempo. Espera ${rl.retryInSeconds ?? 60}s.`,
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const extraction = await extractFromNoteDemo(state, text, today);
  const extractionId = randomUUID();
  state.extractions.set(extractionId, {
    id: extractionId,
    createdAt: nowIso(),
    noteText: text,
    rawExtraction: extraction,
    status: { kind: "pending" },
  });
  return { extractionId };
}

export async function applyExtractionDemo(
  extractionId: string,
  plan: ConfirmedPlanV2,
): Promise<DemoApplyResult> {
  const state = await requireSession();
  const row = state.extractions.get(extractionId);
  if (!row) throw new Error("Extracción no encontrada");
  if (row.status.kind !== "pending") throw new Error("Esta extracción ya está resuelta");

  // 1. resolve mentions → personIds (create stubs cuando kind === "new").
  const personIdByText = new Map<string, string>();
  const createdPeople: { id: string; fullName: string }[] = [];
  for (const [text, res] of Object.entries(plan.resolutions)) {
    if (res.kind === "existing") {
      personIdByText.set(text, res.personId);
    } else if (res.kind === "new") {
      const id = randomUUID();
      const now = nowIso();
      const person: Person = {
        id,
        fullName: res.person.full_name,
        aliases: [],
        role: res.person.role ?? undefined,
        company: res.person.company ?? undefined,
        category: "otro",
        temperature: "frio",
        tags: ["from-nl-input"],
        autoCreated: true,
        priorScore: 0,
        createdAt: now,
        updatedAt: now,
      };
      state.people.set(id, person);
      createdPeople.push({ id, fullName: person.fullName });
      personIdByText.set(text, id);
    }
  }
  const resolve = (text: string): string | null => personIdByText.get(text) ?? null;

  // 2. events.
  const createdEvents: { id: string; name: string }[] = [];
  const eventIdByName = new Map<string, string>();
  for (const e of plan.events) {
    const id = randomUUID();
    state.events.set(id, {
      id,
      name: e.name,
      date: e.date,
      location: e.location ?? undefined,
    });
    createdEvents.push({ id, name: e.name });
    eventIdByName.set(e.name.trim().toLowerCase(), id);
  }

  // 3. observations + participants + supersedes.
  const createdObservationIds: string[] = [];
  const supersededObservationIds: string[] = [];
  for (let i = 0; i < plan.observations.length; i++) {
    const o = plan.observations[i];
    const primaryId = resolve(o.primary_mention.text);
    if (!primaryId) continue;
    const observationId = randomUUID();
    const facets = parseFacetsRaw(o.facets.raw);
    if (
      facets.type === "evento" &&
      typeof facets.event_name === "string" &&
      !facets.event_id
    ) {
      const eid = eventIdByName.get(String(facets.event_name).trim().toLowerCase());
      if (eid) facets.event_id = eid;
    }
    const observation: Observation = {
      id: observationId,
      primaryPersonId: primaryId,
      content: o.content,
      observedAt: o.observed_at,
      tags: o.tags ?? [],
      facets,
      source: "demo-nl-extraction",
      createdAt: nowIso(),
    };
    state.observations.set(observationId, observation);
    createdObservationIds.push(observationId);

    const seen = new Set<string>();
    const push = (personId: string, role: ObservationParticipant["role"]) => {
      const key = `${personId}|${role}`;
      if (seen.has(key)) return;
      seen.add(key);
      state.participants.push({ observationId, personId, role });
    };
    push(primaryId, "primary");
    for (const p of o.participants) {
      const pid = resolve(p.mention.text);
      if (!pid) continue;
      push(pid, p.role as ObservationParticipant["role"]);
    }

    for (const oldId of plan.supersedes?.[i] ?? []) {
      const old = state.observations.get(oldId);
      if (old) {
        old.supersededBy = observationId;
        supersededObservationIds.push(oldId);
      }
    }
  }

  row.status = { kind: "applied", plan };

  return {
    createdPeople,
    createdObservationIds,
    createdEvents,
    supersededObservationIds,
  };
}

export async function discardExtractionDemo(extractionId: string): Promise<void> {
  const state = await requireSession();
  const row = state.extractions.get(extractionId);
  if (!row) throw new Error("Extracción no encontrada");
  if (row.status.kind !== "pending") return;
  row.status = { kind: "discarded" };
}

// ---------- read helpers used por server components ----------

export async function getPendingCountDemo(): Promise<number> {
  const token = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!token) return 0;
  const payload = await verifyDemoToken(token);
  if (!payload?.sid) return 0;
  const state = getSession(payload.sid);
  if (!state) return 0;
  let n = 0;
  for (const e of state.extractions.values()) if (e.status.kind === "pending") n += 1;
  return n;
}

export async function getPendingExtractionsDemo(): Promise<DemoPendingItem[]> {
  const state = await requireSession();
  const items: DemoPendingItem[] = [];
  for (const e of state.extractions.values()) {
    if (e.status.kind === "pending") {
      items.push({
        id: e.id,
        created_at: e.createdAt,
        note_text: e.noteText,
        raw_extraction: e.rawExtraction,
      });
    }
  }
  return items.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
}

// ---------- desktop helpers ----------

export async function getAllPeopleDemo(): Promise<Person[]> {
  const state = await requireSession();
  return [...state.people.values()]
    .filter((p) => !p.archived)
    .sort((a, b) => (b.priorScore ?? 0) - (a.priorScore ?? 0));
}

export async function getPersonByIdDemo(
  id: string,
): Promise<{
  person: Person;
  observations: Observation[];
  encounters: Encounter[];
  events: Event[];
  edges: Array<Edge & { otherPerson: Person | null }>;
  narrative: string | null;
} | null> {
  const state = await requireSession();
  const person = state.people.get(id);
  if (!person) return null;
  // Observations en las que es primary OR participa.
  const partRows = state.participants.filter((p) => p.personId === id);
  const observationIds = new Set<string>();
  for (const r of partRows) observationIds.add(r.observationId);
  const observations: Observation[] = [];
  for (const oid of observationIds) {
    const o = state.observations.get(oid);
    if (o && !o.supersededBy) observations.push(o);
  }
  observations.sort((a, b) => (b.observedAt > a.observedAt ? 1 : -1));
  const encounters = [...state.encounters.values()]
    .filter((e) => e.personId === id)
    .sort((a, b) => (b.date > a.date ? 1 : -1));
  const eventIds = new Set<string>();
  for (const e of encounters) if (e.eventId) eventIds.add(e.eventId);
  const events: Event[] = [];
  for (const eid of eventIds) {
    const ev = state.events.get(eid);
    if (ev) events.push(ev);
  }
  const edges: Array<Edge & { otherPerson: Person | null }> = [];
  for (const e of state.edges.values()) {
    if (e.fromPersonId === id || e.toPersonId === id) {
      const otherId = e.fromPersonId === id ? e.toPersonId : e.fromPersonId;
      edges.push({ ...e, otherPerson: state.people.get(otherId) ?? null });
    }
  }
  return {
    person,
    observations,
    encounters,
    events,
    edges,
    narrative: state.narratives.get(id) ?? null,
  };
}

export async function getDashboardDemo(): Promise<{
  totalPeople: number;
  hot: Person[];
  upcomingEvents: Event[];
  recentEncounters: Array<Encounter & { person: Person | null; event: Event | null }>;
  pendingNotes: number;
}> {
  const state = await requireSession();
  const today = new Date().toISOString().slice(0, 10);
  const people = [...state.people.values()].filter((p) => !p.archived);
  const hot = people
    .filter((p) => p.temperature === "caliente")
    .sort((a, b) => (b.priorScore ?? 0) - (a.priorScore ?? 0))
    .slice(0, 6);
  const upcomingEvents = [...state.events.values()]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const recentEncounters = [...state.encounters.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)
    .map((en) => ({
      ...en,
      person: state.people.get(en.personId) ?? null,
      event: en.eventId ? state.events.get(en.eventId) ?? null : null,
    }));
  let pendingNotes = 0;
  for (const e of state.extractions.values()) if (e.status.kind === "pending") pendingNotes += 1;
  return {
    totalPeople: people.length,
    hot,
    upcomingEvents,
    recentEncounters,
    pendingNotes,
  };
}

export async function getGraphDataDemo(): Promise<{
  people: Person[];
  edges: Edge[];
  coEventEdges: { key: string; weight: number }[];
}> {
  const state = await requireSession();
  // Co-event edges: people who share an event, same derivation as /graph.
  const byEvent = new Map<string, Set<string>>();
  for (const en of state.encounters.values()) {
    if (!en.eventId) continue;
    if (!byEvent.has(en.eventId)) byEvent.set(en.eventId, new Set());
    byEvent.get(en.eventId)!.add(en.personId);
  }
  const co = new Map<string, number>();
  for (const set of byEvent.values()) {
    const arr = [...set];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const k = arr[i] < arr[j] ? `${arr[i]}|${arr[j]}` : `${arr[j]}|${arr[i]}`;
        co.set(k, (co.get(k) ?? 0) + 1);
      }
    }
  }
  return {
    people: [...state.people.values()].filter((p) => !p.archived),
    edges: [...state.edges.values()],
    coEventEdges: [...co.entries()].map(([key, weight]) => ({ key, weight })),
  };
}

export async function searchDirectoryDemo(query: string): Promise<MobilePerson[]> {
  const state = await requireSession();
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return [...state.people.values()]
    .filter((p) => !p.archived)
    .filter((p) =>
      [p.fullName, p.company, p.role].filter(Boolean).join(" ").toLowerCase().includes(q),
    )
    .slice(0, 8)
    .map((p) => ({ id: p.id, full_name: p.fullName, role: p.role ?? null, company: p.company ?? null }));
}

export async function getObservationSnippetsDemo(
  ids: string[],
): Promise<Record<string, { content: string; observedAt: string }>> {
  const state = await requireSession();
  const out: Record<string, { content: string; observedAt: string }> = {};
  for (const id of ids) {
    const o = state.observations.get(id);
    if (o) out[id] = { content: o.content, observedAt: o.observedAt };
  }
  return out;
}

export async function getExtractionByIdDemo(id: string): Promise<DemoExtractionDetail | null> {
  const state = await requireSession();
  const row = state.extractions.get(id);
  if (!row) return null;
  const ids = new Set<string>();
  const visit = (m: { candidate_ids: string[] }) => m.candidate_ids?.forEach((x) => ids.add(x));
  for (const o of row.rawExtraction.observations ?? []) {
    visit(o.primary_mention);
    for (const p of o.participants ?? []) visit(p.mention);
  }
  for (const u of row.rawExtraction.person_updates ?? []) visit(u.primary_mention);
  const people: MobilePerson[] = [];
  for (const pid of ids) {
    const p = state.people.get(pid);
    if (p) {
      people.push({
        id: p.id,
        full_name: p.fullName,
        role: p.role ?? null,
        company: p.company ?? null,
      });
    }
  }
  return {
    id: row.id,
    note_text: row.noteText,
    raw_extraction: row.rawExtraction,
    status: row.status.kind,
    people,
  };
}

