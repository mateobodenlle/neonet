import type { Database, Person, Encounter, Interaction, Event, PainPoint, Promise, Edge } from "./types";

export interface Repository {
  getAll(): Database;
  getPerson(id: string): Person | undefined;
  getEvent(id: string): Event | undefined;
  getEncountersByPerson(personId: string): Encounter[];
  getInteractionsByPerson(personId: string): Interaction[];
  getPainPointsByPerson(personId: string): PainPoint[];
  getPromisesByPerson(personId: string): Promise[];
  getEdgesForPerson(personId: string): Edge[];
  getPeopleByEvent(eventId: string): Person[];
  addPerson(p: Person): void;
  addEncounter(en: Encounter): void;
  addInteraction(i: Interaction): void;
  addPainPoint(pp: PainPoint): void;
  addPromise(pr: Promise): void;
  togglePromise(id: string): void;
}
