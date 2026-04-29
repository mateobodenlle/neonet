// Shapes produced by the LLM extraction step and consumed by the apply step.
// Plain types — usable on both client and server.

export interface ProposedNewPerson {
  full_name: string;
  role: string | null;
  company: string | null;
  notes: string | null;
}

export interface PersonMention {
  /** The exact text the user used to refer to this person. */
  text: string;
  /** Existing person IDs the LLM thinks could match, ordered by likelihood. */
  candidate_ids: string[];
  /** If the LLM decided this is probably a new person, a suggested base record. */
  proposed_new: ProposedNewPerson | null;
}

export interface ExtractedEncounter {
  person_text: string;
  date: string; // YYYY-MM-DD
  location: string | null;
  context: string;
  event_name: string | null;
}

export interface ExtractedPainPoint {
  person_text: string;
  description: string;
}

export interface ExtractedPromise {
  /** Primary person reference. */
  person_text: string;
  /** Other people the same single promise also applies to. */
  also_person_texts: string[];
  description: string;
  direction: "yo-a-el" | "el-a-mi";
  due_date: string | null;
}

export interface ExtractedPersonUpdate {
  person_text: string;
  field: "company" | "role" | "location" | "next_step" | "interests" | "tags" | "category" | "temperature";
  new_value: string;
}

export interface ExtractedConnection {
  from_person_text: string;
  to_person_text: string;
  kind: "presentado-por" | "conoce" | "trabaja-con" | "familiar" | "inversor-de";
  note: string | null;
}

export interface ExtractedEvent {
  name: string;
  date: string; // YYYY-MM-DD
  location: string | null;
}

/** Raw output from the LLM. */
export interface Extraction {
  mentions: PersonMention[];
  encounters: ExtractedEncounter[];
  pain_points: ExtractedPainPoint[];
  promises: ExtractedPromise[];
  person_updates: ExtractedPersonUpdate[];
  connections: ExtractedConnection[];
  events: ExtractedEvent[];
  warnings: string[];
  summary: string;
}

/**
 * After the user has reviewed the extraction in the UI:
 *   - resolved each mention to either an existing personId, a new person,
 *     or skipped it,
 *   - kept/edited/dropped each fact.
 * The plan is what gets passed to applyPlan.
 */
export type MentionResolution =
  | { kind: "existing"; personId: string }
  | { kind: "new"; person: ProposedNewPerson }
  | { kind: "skip" };

export interface ConfirmedPlan {
  noteText: string;
  /** Resolution per mention.text — keys are the mention.text strings. */
  resolutions: Record<string, MentionResolution>;
  encounters: ExtractedEncounter[];
  pain_points: ExtractedPainPoint[];
  promises: ExtractedPromise[];
  person_updates: ExtractedPersonUpdate[];
  connections: ExtractedConnection[];
  events: ExtractedEvent[];
  /** Optional event id chosen for encounters that map to one of the existing events. */
  encounterEventIdByText?: Record<string, string>;
}
