"use server";

/**
 * Server actions for the natural-language input flow.
 *
 *   extractFromNote(text, today)  →  Extraction (draft for the preview UI)
 *   applyPlan(plan)               →  writes to DB through existing CRUD actions
 *
 * Both run server-side so OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY never
 * reach the browser.
 */

import { randomUUID } from "node:crypto";
import { openai, EXTRACTION_MODEL } from "./openai";
import { supabaseAdmin } from "./supabase-admin";
import { personFromRow } from "./mappers";
import { EXTRACTION_SCHEMA, compactDirectory, systemPrompt, type DirectoryRow } from "./nl-prompt";
import {
  persistPerson,
  persistEncounter,
  persistInteraction,
  persistPainPoint,
  persistPromise,
  persistEdge,
  persistEvent,
} from "./server-actions";
import type {
  Extraction,
  ConfirmedPlan,
  ProposedNewPerson,
  ExtractedEncounter,
  ExtractedPainPoint,
  ExtractedPromise,
  ExtractedPersonUpdate,
  ExtractedConnection,
  ExtractedEvent,
} from "./nl-types";
import type { Person, Encounter, Interaction, PainPoint, Promise as DomainPromise, Edge, Event as DomainEvent } from "./types";

async function loadDirectory(): Promise<DirectoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("id, full_name, aliases, company, role, tags")
    .eq("archived", false);
  if (error) throw error;
  return (data ?? []) as DirectoryRow[];
}

export async function extractFromNote(text: string, today: string): Promise<Extraction> {
  if (!text.trim()) throw new Error("Empty note");
  const directory = await loadDirectory();
  const completion = await openai.chat.completions.create({
    model: EXTRACTION_MODEL,
    temperature: 0.1,
    response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA as never },
    messages: [
      { role: "system", content: systemPrompt(today, compactDirectory(directory)) },
      { role: "user", content: text.trim() },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI");
  return JSON.parse(raw) as Extraction;
}

// ---------- apply ----------

function nowIso(): string {
  return new Date().toISOString();
}

function newPerson(suggested: ProposedNewPerson): Person {
  return {
    id: randomUUID(),
    fullName: suggested.full_name,
    aliases: [],
    role: suggested.role ?? undefined,
    company: suggested.company ?? undefined,
    category: "otro",
    temperature: "frio",
    tags: ["from-nl-input"],
    handles: undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function applyUpdateField(p: Person, field: ExtractedPersonUpdate["field"], value: string): Person {
  const next: Person = { ...p, updatedAt: nowIso() };
  switch (field) {
    case "company":
      next.company = value;
      break;
    case "role":
      next.role = value;
      break;
    case "location":
      next.location = value;
      break;
    case "next_step":
      next.nextStep = value;
      break;
    case "interests":
      next.interests = Array.from(new Set([...(p.interests ?? []), ...value.split(",").map((s) => s.trim()).filter(Boolean)]));
      break;
    case "tags":
      next.tags = Array.from(new Set([...(p.tags ?? []), ...value.split(",").map((s) => s.trim()).filter(Boolean)]));
      break;
    case "category":
      next.category = value as Person["category"];
      break;
    case "closeness":
      next.closeness = value as Person["closeness"];
      break;
    case "temperature":
      next.temperature = value as Person["temperature"];
      break;
  }
  return next;
}

export interface ApplyResult {
  createdPeople: Person[];
  updatedPeople: Person[];
  createdEvents: DomainEvent[];
  createdEncounters: Encounter[];
  createdInteractions: Interaction[];
  createdPainPoints: PainPoint[];
  createdPromises: DomainPromise[];
  createdEdges: Edge[];
}

export async function applyPlan(plan: ConfirmedPlan): Promise<ApplyResult> {
  // 1. Resolve every mention.text → personId, creating new persons as needed.
  const personIdByText = new Map<string, string>();
  const createdPeople: Person[] = [];
  const updatedPeople: Person[] = [];
  const eventIdByName = new Map<string, string>();

  for (const [text, res] of Object.entries(plan.resolutions)) {
    if (res.kind === "existing") {
      personIdByText.set(text, res.personId);
    } else if (res.kind === "new") {
      const person = newPerson(res.person);
      await persistPerson(person);
      createdPeople.push(person);
      personIdByText.set(text, person.id);
    }
  }

  // Helper to resolve person reference → id, or null if skipped/missing.
  const resolve = (text: string): string | null => personIdByText.get(text) ?? null;

  // 2. Events first so encounters can refer to them.
  const createdEvents: DomainEvent[] = [];
  for (const e of plan.events) {
    const event: DomainEvent = {
      id: randomUUID(),
      name: e.name,
      date: e.date,
      location: e.location ?? undefined,
    };
    await persistEvent(event);
    createdEvents.push(event);
    eventIdByName.set(e.name.trim().toLowerCase(), event.id);
  }

  // 3. Person updates.
  for (const u of plan.person_updates) {
    const id = resolve(u.person_text);
    if (!id) continue;
    const { data, error } = await supabaseAdmin.from("people").select("*").eq("id", id).single();
    if (error || !data) continue;
    const current = personFromRow(data);
    const next = applyUpdateField(current, u.field, u.new_value);
    await persistPerson(next);
    updatedPeople.push(next);
  }

  // 4. Encounters (and the auto-interaction the store would create for each).
  const createdEncounters: Encounter[] = [];
  const createdInteractions: Interaction[] = [];
  for (const e of plan.encounters) {
    const personId = resolve(e.person_text);
    if (!personId) continue;
    const eventId =
      plan.encounterEventIdByText?.[e.person_text] ??
      (e.event_name ? eventIdByName.get(e.event_name.trim().toLowerCase()) : undefined);
    const encounter: Encounter = {
      id: randomUUID(),
      personId,
      eventId,
      date: e.date,
      location: e.location ?? undefined,
      context: e.context,
    };
    const interaction: Interaction = {
      id: `i-${encounter.id}`,
      personId,
      kind: "encuentro",
      date: e.date,
      summary: e.context,
      encounterId: encounter.id,
    };
    await persistEncounter(encounter, interaction);
    createdEncounters.push(encounter);
    createdInteractions.push(interaction);
  }

  // 5. Pain points.
  const createdPainPoints: PainPoint[] = [];
  for (const pp of plan.pain_points) {
    const personId = resolve(pp.person_text);
    if (!personId) continue;
    const row: PainPoint = {
      id: randomUUID(),
      personId,
      description: pp.description,
      createdAt: nowIso(),
    };
    await persistPainPoint(row);
    createdPainPoints.push(row);
  }

  // 6. Promises.
  const createdPromises: DomainPromise[] = [];
  for (const pr of plan.promises) {
    const personId = resolve(pr.person_text);
    if (!personId) continue;
    const alsoPersonIds = (pr.also_person_texts ?? [])
      .map((t) => resolve(t))
      .filter((id): id is string => !!id && id !== personId);
    const row: DomainPromise = {
      id: randomUUID(),
      personId,
      alsoPersonIds: alsoPersonIds.length ? alsoPersonIds : undefined,
      description: pr.description,
      direction: pr.direction,
      dueDate: pr.due_date ?? undefined,
      done: false,
      createdAt: nowIso(),
    };
    await persistPromise(row);
    createdPromises.push(row);
  }

  // 7. Connections.
  const createdEdges: Edge[] = [];
  for (const c of plan.connections) {
    const fromId = resolve(c.from_person_text);
    const toId = resolve(c.to_person_text);
    if (!fromId || !toId || fromId === toId) continue;
    const edge: Edge = {
      id: randomUUID(),
      fromPersonId: fromId,
      toPersonId: toId,
      kind: c.kind,
      note: c.note ?? undefined,
    };
    await persistEdge(edge);
    createdEdges.push(edge);
  }

  return {
    createdPeople,
    updatedPeople,
    createdEvents,
    createdEncounters,
    createdInteractions,
    createdPainPoints,
    createdPromises,
    createdEdges,
  };
}
