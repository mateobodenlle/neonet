// Shapes produced by the LLM extraction step and consumed by the apply step.
// Plain types — usable on both client and server.

export interface ProposedNewPerson {
  full_name: string;
  role: string | null;
  company: string | null;
  notes: string | null;
}

export type MentionConfidence = "high" | "medium" | "low";

export interface PersonMention {
  /** The exact text the user used to refer to this person. */
  text: string;
  /** Existing person IDs the LLM thinks could match, ordered by likelihood — first is the LLM's pick. */
  candidate_ids: string[];
  /** If the LLM decided this is probably a new person, a suggested base record. */
  proposed_new: ProposedNewPerson | null;
  /** How sure the LLM is about its top pick. Drives the preview UI. v2 only. */
  confidence?: MentionConfidence;
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
  field: "company" | "role" | "location" | "next_step" | "interests" | "tags" | "category" | "temperature" | "closeness";
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

// ============================================================
// v2 — observation-based extraction (parallel to v1 above)
// ============================================================

export type ParticipantRoleV2 =
  | "co_subject"
  | "related"
  | "source"
  | "mentioned"
  | "promise_target";

export interface ExtractedParticipantV2 {
  mention: PersonMention;
  role: ParticipantRoleV2;
}

export interface SupersedesHintV2 {
  reason: string;
  candidate_observation_ids: string[];
}

export interface ExtractedObservationV2 {
  content: string;
  observed_at: string;
  primary_mention: PersonMention;
  participants: ExtractedParticipantV2[];
  tags: string[];
  facets: { raw: string };
  supersedes_hint: SupersedesHintV2 | null;
}

export interface ExtractedPersonUpdateV2 {
  primary_mention: PersonMention;
  field: ExtractedPersonUpdate["field"];
  new_value: string;
}

export interface ExtractionV2 {
  observations: ExtractedObservationV2[];
  events: ExtractedEvent[];
  person_updates: ExtractedPersonUpdateV2[];
  warnings: string[];
  summary: string;
}

/** A single mention.text → resolution entry, keyed by text in the plan map. */
export interface ConfirmedPlanV2 {
  noteText: string;
  /** Resolution per mention.text. The same text may appear in primary_mention
   *  and inside participants — they share the same key. */
  resolutions: Record<string, MentionResolution>;
  observations: ExtractedObservationV2[];
  events: ExtractedEvent[];
  person_updates: ExtractedPersonUpdateV2[];
  /** observation_index → array of confirmed superseded observation ids. */
  supersedes?: Record<number, string[]>;
}
