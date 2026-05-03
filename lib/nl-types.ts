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
  /** How sure the LLM is about its top pick. Drives the preview UI. */
  confidence?: MentionConfidence;
}

export interface ExtractedPersonUpdate {
  person_text: string;
  field: "company" | "role" | "location" | "next_step" | "interests" | "tags" | "category" | "temperature" | "closeness";
  new_value: string;
}

export interface ExtractedEvent {
  name: string;
  date: string; // YYYY-MM-DD
  location: string | null;
}

export type MentionResolution =
  | { kind: "existing"; personId: string }
  | { kind: "new"; person: ProposedNewPerson }
  | { kind: "skip" };

// ============================================================
// Observation-based extraction (v2)
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
