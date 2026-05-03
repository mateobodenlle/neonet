// Database row types — snake_case, mirror of supabase/migrations/0001_init.sql.
// Kept separate from lib/types.ts (which holds the camelCase domain types used
// by the UI) so the mapping is explicit on each side of the boundary.

export interface Database {
  public: {
    Tables: {
      people: {
        Row: PersonRow;
        Insert: Partial<PersonRow> & Pick<PersonRow, "full_name" | "category" | "temperature">;
        Update: Partial<PersonRow>;
      };
      events: {
        Row: EventRow;
        Insert: Partial<EventRow> & Pick<EventRow, "name" | "date">;
        Update: Partial<EventRow>;
      };
      encounters: {
        Row: EncounterRow;
        Insert: Partial<EncounterRow> & Pick<EncounterRow, "person_id" | "date">;
        Update: Partial<EncounterRow>;
      };
      interactions: {
        Row: InteractionRow;
        Insert: Partial<InteractionRow> & Pick<InteractionRow, "person_id" | "kind" | "date" | "summary">;
        Update: Partial<InteractionRow>;
      };
      edges: {
        Row: EdgeRow;
        Insert: Partial<EdgeRow> & Pick<EdgeRow, "from_person_id" | "to_person_id" | "kind">;
        Update: Partial<EdgeRow>;
      };
      observations: {
        Row: ObservationRow;
        Insert: Partial<ObservationRow> & Pick<ObservationRow, "primary_person_id" | "content" | "observed_at" | "source">;
        Update: Partial<ObservationRow>;
      };
      observation_participants: {
        Row: ObservationParticipantRow;
        Insert: ObservationParticipantRow;
        Update: Partial<ObservationParticipantRow>;
      };
      person_profiles: {
        Row: PersonProfileRow;
        Insert: Partial<PersonProfileRow> & Pick<PersonProfileRow, "person_id">;
        Update: Partial<PersonProfileRow>;
      };
    };
  };
}

export interface PersonRow {
  id: string;
  full_name: string;
  aliases: string[];
  photo_url: string | null;
  role: string | null;
  company: string | null;
  sector: string | null;
  seniority: string | null;
  location: string | null;
  handles: Record<string, string> | null;
  category: string;
  temperature: string;
  closeness: string | null;
  tags: string[];
  interests: string[];
  affinity: number | null;
  trust: number | null;
  next_step: string | null;
  archived: boolean;
  auto_created: boolean;
  prior_score: number;
  last_observation_at: string | null;
  observation_count_90d: number;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: string;
  name: string;
  location: string | null;
  date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface EncounterRow {
  id: string;
  person_id: string;
  event_id: string | null;
  date: string;
  location: string | null;
  context: string | null;
  introduced_by_id: string | null;
  created_at: string;
}

export interface InteractionRow {
  id: string;
  person_id: string;
  kind: string;
  date: string;
  summary: string;
  body: string | null;
  encounter_id: string | null;
  created_at: string;
}

export interface EdgeRow {
  id: string;
  from_person_id: string;
  to_person_id: string;
  kind: string;
  note: string | null;
  created_at: string;
}

export type ObservationRoleValue =
  | "primary"
  | "co_subject"
  | "related"
  | "source"
  | "mentioned"
  | "promise_target";

export interface ObservationRow {
  id: string;
  primary_person_id: string;
  content: string;
  observed_at: string;
  source: string;
  tags: string[];
  facets: Record<string, unknown>;
  superseded_by: string | null;
  // pgvector returns/accepts strings via supabase-js JSON; we keep the wire
  // shape as string|null here and convert in the embeddings module.
  embedding: string | null;
  embedding_model: string | null;
  created_at: string;
}

export interface ObservationParticipantRow {
  observation_id: string;
  person_id: string;
  role: ObservationRoleValue;
}

export interface PersonProfileRow {
  person_id: string;
  narrative: string;
  resolved_facts: Record<string, unknown>;
  recurring_themes: string[];
  active_threads: unknown[];
  embedding: string | null;
  embedding_model: string | null;
  last_synthesized_at: string | null;
  observations_at_synthesis: number;
  dirty_since: string | null;
  updated_at: string;
}
