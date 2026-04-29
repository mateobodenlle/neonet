"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type {
  Database,
  Person,
  Encounter,
  Interaction,
  PainPoint,
  Promise as DomainPromise,
  Edge,
  Event as DomainEvent,
} from "./types";
import {
  hydrate as hydrateAction,
  persistPerson,
  deletePersonAction,
  restorePersonAction,
  archivePersonAction,
  persistEncounter,
  updateEncounterAction,
  deleteEncounterAction,
  restoreEncounterAction,
  persistInteraction,
  deleteInteractionAction,
  restoreInteractionAction,
  persistPainPoint,
  deletePainPointAction,
  restorePainPointAction,
  persistPromise,
  deletePromiseAction,
  restorePromiseAction,
  togglePromiseAction,
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
  painPoints: PainPoint[];
  promises: DomainPromise[];
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

  addPainPoint: (p: PainPoint) => void;
  updatePainPoint: (id: string, patch: Partial<PainPoint>) => void;
  deletePainPoint: (id: string) => PainPoint | null;
  restorePainPoint: (p: PainPoint) => void;

  addPromise: (p: DomainPromise) => void;
  updatePromise: (id: string, patch: Partial<DomainPromise>) => void;
  deletePromise: (id: string) => DomainPromise | null;
  restorePromise: (p: DomainPromise) => void;
  togglePromise: (id: string) => void;

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
  painPoints: [],
  promises: [],
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
      painPoints: s.painPoints.filter((p) => p.personId === id),
      promises: s.promises.filter((p) => p.personId === id || (p.alsoPersonIds ?? []).includes(id)),
      edges: s.edges.filter((e) => e.fromPersonId === id || e.toPersonId === id),
    };
    set({
      people: s.people.filter((p) => p.id !== id),
      encounters: s.encounters.filter((e) => e.personId !== id),
      interactions: s.interactions.filter((i) => i.personId !== id),
      painPoints: s.painPoints.filter((p) => p.personId !== id),
      promises: s.promises
        .map((p) =>
          (p.alsoPersonIds ?? []).includes(id)
            ? { ...p, alsoPersonIds: (p.alsoPersonIds ?? []).filter((x) => x !== id) }
            : p
        )
        .filter((p) => p.personId !== id),
      edges: s.edges.filter((e) => e.fromPersonId !== id && e.toPersonId !== id),
    });
    syncFireAndForget("borrar contacto", () => deletePersonAction(id));
    return related;
  },
  restorePerson: (person, related) => {
    set((s) => ({
      people: [person, ...s.people],
      encounters: [...related.encounters, ...s.encounters],
      interactions: [...related.interactions, ...s.interactions],
      painPoints: [...related.painPoints, ...s.painPoints],
      promises: [...related.promises, ...s.promises],
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

  // pain_points ---------------------------------------------------------
  addPainPoint: (p) => {
    set((s) => ({ painPoints: [p, ...s.painPoints] }));
    syncFireAndForget("crear pain point", () => persistPainPoint(p));
  },
  updatePainPoint: (id, patch) => {
    set((s) => ({
      painPoints: s.painPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    const next = get().painPoints.find((p) => p.id === id);
    if (next) syncFireAndForget("actualizar pain point", () => persistPainPoint(next));
  },
  deletePainPoint: (id) => {
    const s = get();
    const pp = s.painPoints.find((p) => p.id === id);
    if (!pp) return null;
    set({ painPoints: s.painPoints.filter((p) => p.id !== id) });
    syncFireAndForget("borrar pain point", () => deletePainPointAction(id));
    return pp;
  },
  restorePainPoint: (p) => {
    set((s) => ({ painPoints: [p, ...s.painPoints] }));
    syncFireAndForget("restaurar pain point", () => restorePainPointAction(p));
  },

  // promises ------------------------------------------------------------
  addPromise: (p) => {
    set((s) => ({ promises: [p, ...s.promises] }));
    syncFireAndForget("crear compromiso", () => persistPromise(p));
  },
  updatePromise: (id, patch) => {
    set((s) => ({
      promises: s.promises.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    const next = get().promises.find((p) => p.id === id);
    if (next) syncFireAndForget("actualizar compromiso", () => persistPromise(next));
  },
  deletePromise: (id) => {
    const s = get();
    const pr = s.promises.find((p) => p.id === id);
    if (!pr) return null;
    set({ promises: s.promises.filter((p) => p.id !== id) });
    syncFireAndForget("borrar compromiso", () => deletePromiseAction(id));
    return pr;
  },
  restorePromise: (p) => {
    set((s) => ({ promises: [p, ...s.promises] }));
    syncFireAndForget("restaurar compromiso", () => restorePromiseAction(p));
  },
  togglePromise: (id) => {
    set((s) => ({
      promises: s.promises.map((pr) =>
        pr.id === id
          ? {
              ...pr,
              done: !pr.done,
              completedAt: !pr.done ? new Date().toISOString() : undefined,
            }
          : pr
      ),
    }));
    syncFireAndForget("marcar compromiso", () => togglePromiseAction(id));
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
    getPainPointsByPerson: (pid: string) => db.painPoints.filter((p) => p.personId === pid),
    getPromisesByPerson: (pid: string) =>
      db.promises.filter((p) => p.personId === pid || (p.alsoPersonIds ?? []).includes(pid)),
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
