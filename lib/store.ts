"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Database, Person, Encounter, Interaction, PainPoint, Promise, Edge, Event } from "./types";
import { mockDatabase } from "./mock-data";

interface RelatedSnapshot {
  encounters: Encounter[];
  interactions: Interaction[];
  painPoints: PainPoint[];
  promises: Promise[];
  edges: Edge[];
}

interface Actions {
  reset: () => void;
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

  addPromise: (p: Promise) => void;
  updatePromise: (id: string, patch: Partial<Promise>) => void;
  deletePromise: (id: string) => Promise | null;
  restorePromise: (p: Promise) => void;
  togglePromise: (id: string) => void;

  addEvent: (e: Event) => void;
  updateEvent: (id: string, patch: Partial<Event>) => void;
  deleteEvent: (id: string) => Event | null;
  restoreEvent: (e: Event) => void;

  addEdge: (e: Edge) => void;
  deleteEdge: (id: string) => Edge | null;
  restoreEdge: (e: Edge) => void;
}

export const useStore = create<Database & Actions>()(
  persist(
    (set, get) => ({
      ...mockDatabase,
      reset: () => set(mockDatabase),

      addPerson: (p) => set((s) => ({ people: [p, ...s.people] })),
      updatePerson: (id, patch) =>
        set((s) => ({
          people: s.people.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
          ),
        })),
      deletePerson: (id) => {
        const s = get();
        const person = s.people.find((p) => p.id === id);
        if (!person) return null;
        const related: RelatedSnapshot = {
          encounters: s.encounters.filter((e) => e.personId === id),
          interactions: s.interactions.filter((i) => i.personId === id),
          painPoints: s.painPoints.filter((p) => p.personId === id),
          promises: s.promises.filter((p) => p.personId === id),
          edges: s.edges.filter((e) => e.fromPersonId === id || e.toPersonId === id),
        };
        set({
          people: s.people.filter((p) => p.id !== id),
          encounters: s.encounters.filter((e) => e.personId !== id),
          interactions: s.interactions.filter((i) => i.personId !== id),
          painPoints: s.painPoints.filter((p) => p.personId !== id),
          promises: s.promises.filter((p) => p.personId !== id),
          edges: s.edges.filter((e) => e.fromPersonId !== id && e.toPersonId !== id),
        });
        return related;
      },
      restorePerson: (person, related) =>
        set((s) => ({
          people: [person, ...s.people],
          encounters: [...related.encounters, ...s.encounters],
          interactions: [...related.interactions, ...s.interactions],
          painPoints: [...related.painPoints, ...s.painPoints],
          promises: [...related.promises, ...s.promises],
          edges: [...related.edges, ...s.edges],
        })),
      archivePerson: (id, archived) =>
        set((s) => ({
          people: s.people.map((p) =>
            p.id === id ? { ...p, archived, updatedAt: new Date().toISOString() } : p
          ),
        })),

      addEncounter: (e) =>
        set((s) => ({
          encounters: [e, ...s.encounters],
          interactions: [
            {
              id: `i-${e.id}`,
              personId: e.personId,
              kind: "encuentro",
              date: e.date,
              summary: e.context ?? "Encuentro",
              encounterId: e.id,
            },
            ...s.interactions,
          ],
        })),
      updateEncounter: (id, patch) =>
        set((s) => ({
          encounters: s.encounters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
          interactions: s.interactions.map((i) =>
            i.encounterId === id
              ? {
                  ...i,
                  date: patch.date ?? i.date,
                  summary: patch.context ?? i.summary,
                }
              : i
          ),
        })),
      deleteEncounter: (id) => {
        const s = get();
        const encounter = s.encounters.find((e) => e.id === id);
        if (!encounter) return null;
        const interaction = s.interactions.find((i) => i.encounterId === id);
        set({
          encounters: s.encounters.filter((e) => e.id !== id),
          interactions: s.interactions.filter((i) => i.encounterId !== id),
        });
        return { encounter, interaction };
      },
      restoreEncounter: (encounter, interaction) =>
        set((s) => ({
          encounters: [encounter, ...s.encounters],
          interactions: interaction ? [interaction, ...s.interactions] : s.interactions,
        })),

      addInteraction: (i) => set((s) => ({ interactions: [i, ...s.interactions] })),
      updateInteraction: (id, patch) =>
        set((s) => ({
          interactions: s.interactions.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),
      deleteInteraction: (id) => {
        const s = get();
        const it = s.interactions.find((i) => i.id === id);
        if (!it) return null;
        set({ interactions: s.interactions.filter((i) => i.id !== id) });
        return it;
      },
      restoreInteraction: (i) => set((s) => ({ interactions: [i, ...s.interactions] })),

      addPainPoint: (p) => set((s) => ({ painPoints: [p, ...s.painPoints] })),
      updatePainPoint: (id, patch) =>
        set((s) => ({
          painPoints: s.painPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePainPoint: (id) => {
        const s = get();
        const pp = s.painPoints.find((p) => p.id === id);
        if (!pp) return null;
        set({ painPoints: s.painPoints.filter((p) => p.id !== id) });
        return pp;
      },
      restorePainPoint: (p) => set((s) => ({ painPoints: [p, ...s.painPoints] })),

      addPromise: (p) => set((s) => ({ promises: [p, ...s.promises] })),
      updatePromise: (id, patch) =>
        set((s) => ({
          promises: s.promises.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      deletePromise: (id) => {
        const s = get();
        const pr = s.promises.find((p) => p.id === id);
        if (!pr) return null;
        set({ promises: s.promises.filter((p) => p.id !== id) });
        return pr;
      },
      restorePromise: (p) => set((s) => ({ promises: [p, ...s.promises] })),
      togglePromise: (id) =>
        set((s) => ({
          promises: s.promises.map((pr) =>
            pr.id === id
              ? { ...pr, done: !pr.done, completedAt: !pr.done ? new Date().toISOString() : undefined }
              : pr
          ),
        })),

      addEvent: (e) => set((s) => ({ events: [e, ...s.events] })),
      updateEvent: (id, patch) =>
        set((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEvent: (id) => {
        const s = get();
        const ev = s.events.find((e) => e.id === id);
        if (!ev) return null;
        set({ events: s.events.filter((e) => e.id !== id) });
        return ev;
      },
      restoreEvent: (e) => set((s) => ({ events: [e, ...s.events] })),

      addEdge: (e) => set((s) => ({ edges: [e, ...s.edges] })),
      deleteEdge: (id) => {
        const s = get();
        const edge = s.edges.find((e) => e.id === id);
        if (!edge) return null;
        set({ edges: s.edges.filter((e) => e.id !== id) });
        return edge;
      },
      restoreEdge: (e) => set((s) => ({ edges: [e, ...s.edges] })),
    }),
    { name: "agenda2-db", version: 2 }
  )
);

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
    getPromisesByPerson: (pid: string) => db.promises.filter((p) => p.personId === pid),
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
