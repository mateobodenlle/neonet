// Tipos internos del store demo. Usamos los tipos de dominio reales (Person,
// Event, ...) para poder reutilizar componentes presentacionales sin adaptar.

import type { ExtractionV2, ConfirmedPlanV2 } from "@/lib/nl-types";
import type { MobilePerson } from "@/lib/mobile-types";
import type {
  Edge,
  Encounter,
  Event,
  Observation,
  ObservationParticipant,
  Person,
} from "@/lib/types";

export type {
  Edge as DemoEdge,
  Encounter as DemoEncounter,
  Event as DemoEvent,
  Observation as DemoObservation,
  ObservationParticipant as DemoParticipant,
  Person as DemoPerson,
} from "@/lib/types";

export type DemoExtractionStatus =
  | { kind: "pending" }
  | { kind: "applied"; plan: ConfirmedPlanV2 }
  | { kind: "discarded" };

export interface DemoExtraction {
  id: string;
  createdAt: string;
  noteText: string;
  rawExtraction: ExtractionV2;
  status: DemoExtractionStatus;
}

export interface DemoApplyResult {
  createdPeople: { id: string; fullName: string }[];
  createdObservationIds: string[];
  createdEvents: { id: string; name: string }[];
  supersededObservationIds: string[];
}

export interface DemoPendingItem {
  id: string;
  created_at: string;
  note_text: string;
  raw_extraction: ExtractionV2;
}

export interface DemoExtractionDetail {
  id: string;
  note_text: string;
  raw_extraction: ExtractionV2;
  status: "pending" | "applied" | "discarded";
  people: MobilePerson[];
}

export interface DemoSessionState {
  sid: string;
  createdAt: number;
  lastTouched: number;
  people: Map<string, Person>;
  observations: Map<string, Observation>;
  participants: ObservationParticipant[];
  events: Map<string, Event>;
  encounters: Map<string, Encounter>;
  edges: Map<string, Edge>;
  narratives: Map<string, string>;
  extractions: Map<string, DemoExtraction>;
}
