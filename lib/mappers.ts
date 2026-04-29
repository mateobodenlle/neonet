// Bidirectional mappers between domain types (lib/types.ts, camelCase) and
// database rows (lib/types-db.ts, snake_case).

import type {
  Person,
  Event as DomainEvent,
  Encounter,
  Interaction,
  PainPoint,
  Promise as DomainPromise,
  Edge,
  SocialHandles,
  Category,
  Temperature,
  Sector,
  Seniority,
  InteractionKind,
} from "./types";
import type {
  PersonRow,
  EventRow,
  EncounterRow,
  InteractionRow,
  PainPointRow,
  PromiseRow,
  EdgeRow,
} from "./types-db";

// people ----------------------------------------------------------------
export function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    fullName: r.full_name,
    aliases: r.aliases,
    photoUrl: r.photo_url ?? undefined,
    role: r.role ?? undefined,
    company: r.company ?? undefined,
    sector: (r.sector ?? undefined) as Sector | undefined,
    seniority: (r.seniority ?? undefined) as Seniority | undefined,
    location: r.location ?? undefined,
    handles: (r.handles ?? undefined) as SocialHandles | undefined,
    category: r.category as Category,
    temperature: r.temperature as Temperature,
    tags: r.tags,
    interests: r.interests,
    affinity: (r.affinity ?? undefined) as Person["affinity"],
    trust: (r.trust ?? undefined) as Person["trust"],
    nextStep: r.next_step ?? undefined,
    archived: r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function personToRow(p: Person): PersonRow {
  return {
    id: p.id,
    full_name: p.fullName,
    aliases: p.aliases ?? [],
    photo_url: p.photoUrl ?? null,
    role: p.role ?? null,
    company: p.company ?? null,
    sector: p.sector ?? null,
    seniority: p.seniority ?? null,
    location: p.location ?? null,
    handles: (p.handles ?? null) as PersonRow["handles"],
    category: p.category,
    temperature: p.temperature,
    tags: p.tags ?? [],
    interests: p.interests ?? [],
    affinity: p.affinity ?? null,
    trust: p.trust ?? null,
    next_step: p.nextStep ?? null,
    archived: p.archived ?? false,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// events ---------------------------------------------------------------
export function eventFromRow(r: EventRow): DomainEvent {
  return {
    id: r.id,
    name: r.name,
    location: r.location ?? undefined,
    date: r.date,
    endDate: r.end_date ?? undefined,
    notes: r.notes ?? undefined,
  };
}

export function eventToRow(e: DomainEvent): Omit<EventRow, "created_at"> {
  return {
    id: e.id,
    name: e.name,
    location: e.location ?? null,
    date: e.date,
    end_date: e.endDate ?? null,
    notes: e.notes ?? null,
  };
}

// encounters -----------------------------------------------------------
export function encounterFromRow(r: EncounterRow): Encounter {
  return {
    id: r.id,
    personId: r.person_id,
    eventId: r.event_id ?? undefined,
    date: r.date,
    location: r.location ?? undefined,
    context: r.context ?? undefined,
    introducedById: r.introduced_by_id ?? undefined,
  };
}

export function encounterToRow(e: Encounter): Omit<EncounterRow, "created_at"> {
  return {
    id: e.id,
    person_id: e.personId,
    event_id: e.eventId ?? null,
    date: e.date,
    location: e.location ?? null,
    context: e.context ?? null,
    introduced_by_id: e.introducedById ?? null,
  };
}

// interactions ---------------------------------------------------------
export function interactionFromRow(r: InteractionRow): Interaction {
  return {
    id: r.id,
    personId: r.person_id,
    kind: r.kind as InteractionKind,
    date: r.date,
    summary: r.summary,
    body: r.body ?? undefined,
    encounterId: r.encounter_id ?? undefined,
  };
}

export function interactionToRow(i: Interaction): Omit<InteractionRow, "created_at"> {
  return {
    id: i.id,
    person_id: i.personId,
    kind: i.kind,
    date: i.date,
    summary: i.summary,
    body: i.body ?? null,
    encounter_id: i.encounterId ?? null,
  };
}

// pain_points ----------------------------------------------------------
export function painPointFromRow(r: PainPointRow): PainPoint {
  return {
    id: r.id,
    personId: r.person_id,
    description: r.description,
    createdAt: r.created_at,
    sourceEncounterId: r.source_encounter_id ?? undefined,
    sourceInteractionId: r.source_interaction_id ?? undefined,
    resolved: r.resolved,
  };
}

export function painPointToRow(p: PainPoint): Omit<PainPointRow, "created_at"> & { created_at?: string } {
  return {
    id: p.id,
    person_id: p.personId,
    description: p.description,
    source_encounter_id: p.sourceEncounterId ?? null,
    source_interaction_id: p.sourceInteractionId ?? null,
    resolved: p.resolved ?? false,
    created_at: p.createdAt,
  };
}

// promises -------------------------------------------------------------
export function promiseFromRow(r: PromiseRow): DomainPromise {
  return {
    id: r.id,
    personId: r.person_id,
    description: r.description,
    direction: r.direction,
    dueDate: r.due_date ?? undefined,
    done: r.done,
    createdAt: r.created_at,
    completedAt: r.completed_at ?? undefined,
  };
}

export function promiseToRow(p: DomainPromise): Omit<PromiseRow, "created_at"> & { created_at?: string } {
  return {
    id: p.id,
    person_id: p.personId,
    description: p.description,
    direction: p.direction,
    due_date: p.dueDate ?? null,
    done: p.done,
    completed_at: p.completedAt ?? null,
    created_at: p.createdAt,
  };
}

// edges ----------------------------------------------------------------
export function edgeFromRow(r: EdgeRow): Edge {
  return {
    id: r.id,
    fromPersonId: r.from_person_id,
    toPersonId: r.to_person_id,
    kind: r.kind as Edge["kind"],
    note: r.note ?? undefined,
  };
}

export function edgeToRow(e: Edge): Omit<EdgeRow, "created_at"> {
  return {
    id: e.id,
    from_person_id: e.fromPersonId,
    to_person_id: e.toPersonId,
    kind: e.kind,
    note: e.note ?? null,
  };
}
