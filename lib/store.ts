"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type {
  Database,
  Person,
  Encounter,
  Interaction,
  Edge,
  Event as DomainEvent,
} from "./types";
import { mergePersonFields } from "./merge-people";
import {
  hydrate as hydrateAction,
  persistPerson,
  deletePersonAction,
  deletePersonsAction,
  mergePeopleAction,
  restorePersonAction,
  archivePersonAction,
  persistEncounter,
  updateEncounterAction,
  deleteEncounterAction,
  restoreEncounterAction,
  persistInteraction,
  deleteInteractionAction,
  restoreInteractionAction,
  persistEvent,
  deleteEventAction,
  restoreEventAction,
  persistEdge,
  deleteEdgeAction,
  restoreEdgeAction,
} from "./server-actions";

interface RelatedSnapshot {
  encounters: Encounter[];
  interactions: Interaction[];
  edges: Edge[];
}

interface SyncState {
  hydrated: boolean;
  hydrating: boolean;
}

interface Actions {
  hydrate: () => Promise<void>;

  addPerson: (p: Person) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePerson: (id: string) => RelatedSnapshot | null;
  bulkDeletePeople: (ids: string[]) => number;
  mergePeople: (keepId: string, dropId: string) => Person | null;
  restorePerson: (person: Person, related: RelatedSnapshot) => void;
  archivePerson: (id: string, archived: boolean) => void;

  addEncounter: (e: Encounter) => void;
  updateEncounter: (id: string, patch: Partial<Encounter>) => void;
  deleteEncounter: (id: string) => { encounter: Encounter; interaction?: Interaction } | null;
  restoreEncounter: (encounter: Encounter, interaction?: Interaction) => void;

  addInteraction: (i: Interaction) => void;
  updateInteraction: (id: string, patch: Partial<Interaction>) => void;
  deleteInteraction: (id: string) => Interaction | null;
  restoreInteraction: (i: Interaction) => void;

  addEvent: (e: DomainEvent) => void;
  updateEvent: (id: string, patch: Partial<DomainEvent>) => void;
  deleteEvent: (id: string) => DomainEvent | null;
  restoreEvent: (e: DomainEvent) => void;

  addEdge: (e: Edge) => void;
  deleteEdge: (id: string) => Edge | null;
  restoreEdge: (e: Edge) => void;
}

const empty: Database = {
  people: [],
  events: [],
  encounters: [],
  interactions: [],
  edges: [],
};

// Fire a server action and toast on failure. Optimistic local state stays
// as-is on error rather than rolling back, which matches the user's mental
// model of "I just made the change" — they'll see the inconsistency on the
// next reload instead of the change vanishing under their cursor.
function syncFireAndForget(label: string, op: () => Promise<unknown>) {
  op().catch((err) => {
    console.error(`[sync] ${label}`, err);
    toast.error(`Error de sincronización · ${label}`, {
      description: err instanceof Error ? err.message : String(err),
    });
  });
}

export const useStore = create<Database & SyncState & Actions>()((set, get) => ({
  ...empty,
  hydrated: false,
  hydrating: false,

  hydrate: async () => {
    if (get().hydrating) return;
    set({ hydrating: true });
    try {
      const db = await hydrateAction();
      set({ ...db, hydrated: true, hydrating: false });
    } catch (err) {
      set({ hydrating: false });
      console.error("[hydrate]", err);
      toast.error("No se pudo cargar la base de datos", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  },

  // people --------------------------------------------------------------
  addPerson: (p) => {
    set((s) => ({ people: [p, ...s.people] }));
    syncFireAndForget("crear contacto", () => persistPerson(p));
  },
  updatePerson: (id, patch) => {
    const updatedAt = new Date().toISOString();
    set((s) => ({
      people: s.people.map((p) => (p.id === id ? { ...p, ...patch, updatedAt } : p)),
    }));
    const next = get().people.find((p) => p.id === id);
    if (next) syncFireAndForget("actualizar contacto", () => persistPerson(next));
  },
  deletePerson: (id) => {
    const s = get();
    const person = s.people.find((p) => p.id === id);
    if (!person) return null;
    const related: RelatedSnapshot = {
      encounters: s.encounters.filter((e) => e.personId === id),
      interactions: s.interactions.filter((i) => i.personId === id),
      edges: s.edges.filter((e) => e.fromPersonId === id || e.toPersonId === id),
    };
    set({
      people: s.people.filter((p) => p.id !== id),
      encounters: s.encounters.filter((e) => e.personId !== id),
      interactions: s.interactions.filter((i) => i.personId !== id),
      edges: s.edges.filter((e) => e.fromPersonId !== id && e.toPersonId !== id),
    });
    syncFireAndForget("borrar contacto", () => deletePersonAction(id));
    return related;
  },
  bulkDeletePeople: (ids) => {
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    const s = get();
    const removed = s.people.filter((p) => idSet.has(p.id));
    if (removed.length === 0) return 0;
    set({
      people: s.people.filter((p) => !idSet.has(p.id)),
      encounters: s.encounters.filter((e) => !idSet.has(e.personId)),
      interactions: s.interactions.filter((i) => !idSet.has(i.personId)),
      edges: s.edges.filter(
        (e) => !idSet.has(e.fromPersonId) && !idSet.has(e.toPersonId)
      ),
    });
    syncFireAndForget("borrar contactos", () =>
      deletePersonsAction(removed.map((p) => p.id))
    );
    return removed.length;
  },
  mergePeople: (keepId, dropId) => {
    if (keepId === dropId) return null;
    const s = get();
    const keep = s.people.find((p) => p.id === keepId);
    const drop = s.people.find((p) => p.id === dropId);
    if (!keep || !drop) return null;
    const merged = mergePersonFields(keep, drop);

    const remap = (id: string | undefined) => (id === dropId ? keepId : id);

    const encounters = s.encounters.map((e) => ({
      ...e,
      personId: remap(e.personId)!,
      introducedById:
        e.introducedById === dropId ? keepId : e.introducedById,
    })).map((e) => (e.introducedById === e.personId ? { ...e, introducedById: undefined } : e));

    const interactions = s.interactions.map((i) => ({
      ...i,
      personId: remap(i.personId)!,
    }));

    // Edge dedup mirrors the SQL: drop self-loops, drop dupes by (from,to,kind).
    const seenEdgeKeys = new Set<string>();
    const edges = s.edges
      .map((e) => ({
        ...e,
        fromPersonId: remap(e.fromPersonId)!,
        toPersonId: remap(e.toPersonId)!,
      }))
      .filter((e) => e.fromPersonId !== e.toPersonId)
      .filter((e) => {
        const k = `${e.fromPersonId}|${e.toPersonId}|${e.kind}`;
        if (seenEdgeKeys.has(k)) return false;
        seenEdgeKeys.add(k);
        return true;
      });

    set({
      people: s.people
        .filter((p) => p.id !== dropId)
        .map((p) => (p.id === keepId ? merged : p)),
      encounters,
      interactions,
      edges,
    });
    syncFireAndForget("combinar contactos", () => mergePeopleAction(keepId, dropId));
    return merged;
  },
  restorePerson: (person, related) => {
    set((s) => ({
      people: [person, ...s.people],
      encounters: [...related.encounters, ...s.encounters],
      interactions: [...related.interactions, ...s.interactions],
      edges: [...related.edges, ...s.edges],
    }));
    syncFireAndForget("restaurar contacto", () => restorePersonAction(person, related));
  },
  archivePerson: (id, archived) => {
    const updatedAt = new Date().toISOString();
    set((s) => ({
      people: s.people.map((p) => (p.id === id ? { ...p, archived, updatedAt } : p)),
    }));
    syncFireAndForget("archivar contacto", () => archivePersonAction(id, archived));
  },

  // encounters ----------------------------------------------------------
  addEncounter: (e) => {
    const autoInteraction: Interaction = {
      id: `i-${e.id}`,
      personId: e.personId,
      kind: "encuentro",
      date: e.date,
      summary: e.context ?? "Encuentro",
      encounterId: e.id,
    };
    set((s) => ({
      encounters: [e, ...s.encounters],
      interactions: [autoInteraction, ...s.interactions],
    }));
    syncFireAndForget("crear encuentro", () => persistEncounter(e, autoInteraction));
  },
  updateEncounter: (id, patch) => {
    set((s) => ({
      encounters: s.encounters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      interactions: s.interactions.map((i) =>
        i.encounterId === id
          ? { ...i, date: patch.date ?? i.date, summary: patch.context ?? i.summary }
          : i
      ),
    }));
    syncFireAndForget("actualizar encuentro", () => updateEncounterAction(id, patch));
  },
  deleteEncounter: (id) => {
    const s = get();
    const encounter = s.encounters.find((e) => e.id === id);
    if (!encounter) return null;
    const interaction = s.interactions.find((i) => i.encounterId === id);
    set({
      encounters: s.encounters.filter((e) => e.id !== id),
      interactions: s.interactions.filter((i) => i.encounterId !== id),
    });
    syncFireAndForget("borrar encuentro", () => deleteEncounterAction(id));
    return { encounter, interaction };
  },
  restoreEncounter: (encounter, interaction) => {
    set((s) => ({
      encounters: [encounter, ...s.encounters],
      interactions: interaction ? [interaction, ...s.interactions] : s.interactions,
    }));
    syncFireAndForget("restaurar encuentro", () => restoreEncounterAction(encounter, interaction));
  },

  // interactions --------------------------------------------------------
  addInteraction: (i) => {
    set((s) => ({ interactions: [i, ...s.interactions] }));
    syncFireAndForget("crear nota", () => persistInteraction(i));
  },
  updateInteraction: (id, patch) => {
    set((s) => ({
      interactions: s.interactions.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
    const next = get().interactions.find((i) => i.id === id);
    if (next) syncFireAndForget("actualizar nota", () => persistInteraction(next));
  },
  deleteInteraction: (id) => {
    const s = get();
    const it = s.interactions.find((i) => i.id === id);
    if (!it) return null;
    set({ interactions: s.interactions.filter((i) => i.id !== id) });
    syncFireAndForget("borrar nota", () => deleteInteractionAction(id));
    return it;
  },
  restoreInteraction: (i) => {
    set((s) => ({ interactions: [i, ...s.interactions] }));
    syncFireAndForget("restaurar nota", () => restoreInteractionAction(i));
  },

  // events --------------------------------------------------------------
  addEvent: (e) => {
    set((s) => ({ events: [e, ...s.events] }));
    syncFireAndForget("crear evento", () => persistEvent(e));
  },
  updateEvent: (id, patch) => {
    set((s) => ({
      events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
    const next = get().events.find((e) => e.id === id);
    if (next) syncFireAndForget("actualizar evento", () => persistEvent(next));
  },
  deleteEvent: (id) => {
    const s = get();
    const ev = s.events.find((e) => e.id === id);
    if (!ev) return null;
    set({ events: s.events.filter((e) => e.id !== id) });
    syncFireAndForget("borrar evento", () => deleteEventAction(id));
    return ev;
  },
  restoreEvent: (e) => {
    set((s) => ({ events: [e, ...s.events] }));
    syncFireAndForget("restaurar evento", () => restoreEventAction(e));
  },

  // edges ---------------------------------------------------------------
  addEdge: (e) => {
    set((s) => ({ edges: [e, ...s.edges] }));
    syncFireAndForget("crear conexión", () => persistEdge(e));
  },
  deleteEdge: (id) => {
    const s = get();
    const edge = s.edges.find((e) => e.id === id);
    if (!edge) return null;
    set({ edges: s.edges.filter((e) => e.id !== id) });
    syncFireAndForget("borrar conexión", () => deleteEdgeAction(id));
    return edge;
  },
  restoreEdge: (e) => {
    set((s) => ({ edges: [e, ...s.edges] }));
    syncFireAndForget("restaurar conexión", () => restoreEdgeAction(e));
  },
}));

export function useDerived() {
  const db = useStore();
  return {
    db,
    getPerson: (id: string) => db.people.find((p) => p.id === id),
    getEvent: (id: string) => db.events.find((e) => e.id === id),
    getEncounter: (id: string) => db.encounters.find((en) => en.id === id),
    getEncountersByPerson: (pid: string) =>
      db.encounters.filter((en) => en.personId === pid).sort((a, b) => b.date.localeCompare(a.date)),
    getInteractionsByPerson: (pid: string) =>
      db.interactions.filter((i) => i.personId === pid).sort((a, b) => b.date.localeCompare(a.date)),
    getEdgesForPerson: (pid: string) =>
      db.edges.filter((e) => e.fromPersonId === pid || e.toPersonId === pid),
    getPeopleByEvent: (eid: string) => {
      const ids = new Set(db.encounters.filter((en) => en.eventId === eid).map((en) => en.personId));
      return db.people.filter((p) => ids.has(p.id));
    },
    getEncountersByEvent: (eid: string) =>
      db.encounters.filter((en) => en.eventId === eid).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
