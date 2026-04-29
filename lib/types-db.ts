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
      pain_points: {
        Row: PainPointRow;
        Insert: Partial<PainPointRow> & Pick<PainPointRow, "person_id" | "description">;
        Update: Partial<PainPointRow>;
      };
      promises: {
        Row: PromiseRow;
        Insert: Partial<PromiseRow> & Pick<PromiseRow, "person_id" | "description" | "direction">;
        Update: Partial<PromiseRow>;
      };
      edges: {
        Row: EdgeRow;
        Insert: Partial<EdgeRow> & Pick<EdgeRow, "from_person_id" | "to_person_id" | "kind">;
        Update: Partial<EdgeRow>;
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

export interface PainPointRow {
  id: string;
  person_id: string;
  description: string;
  source_encounter_id: string | null;
  source_interaction_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface PromiseRow {
  id: string;
  person_id: string;
  also_person_ids: string[];
  description: string;
  direction: "yo-a-el" | "el-a-mi";
  due_date: string | null;
  done: boolean;
  completed_at: string | null;
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
