-- Persists every NL extraction (raw LLM output + applied plan + corrections)
-- so the internal eval-builder UI can promote real interactions into
-- data/eval/extraction-cases.jsonl. Append-only from the flow's perspective:
-- the row is inserted right after the LLM call and updated once on apply.

create table public.nl_extractions (
  id                          uuid primary key default gen_random_uuid(),
  created_at                  timestamptz not null default now(),

  note_text                   text not null,
  note_context                text,
  today_date                  date not null,
  prompt_version              text not null,
  extraction_type             text not null,
  subject_person_id           uuid,
  model                       text not null,
  llm_call_id                 uuid references public.llm_calls(id) on delete set null,

  raw_extraction              jsonb not null,
  applied_plan                jsonb,
  applied_at                  timestamptz,

  affected_person_ids         uuid[] not null default '{}',
  affected_organization_ids   uuid[] not null default '{}',

  note_length_chars           int not null,
  directory_size              int,
  duration_ms                 int,
  prompt_tokens               int,
  cached_tokens               int,
  completion_tokens           int,
  error_message               text,

  metadata                    jsonb not null default '{}'::jsonb,

  constraint nl_extractions_type_chk
    check (extraction_type in ('global', 'per-person'))
);

create index nl_extractions_created_at_idx
  on public.nl_extractions (created_at desc);

create index nl_extractions_affected_persons_gin
  on public.nl_extractions using gin (affected_person_ids);

create index nl_extractions_affected_orgs_gin
  on public.nl_extractions using gin (affected_organization_ids);

alter table public.nl_extractions enable row level security;


create table public.nl_extraction_corrections (
  id                uuid primary key default gen_random_uuid(),
  extraction_id     uuid not null references public.nl_extractions(id) on delete cascade,
  correction_type   text not null,
  before            jsonb not null,
  after             jsonb not null,
  created_at        timestamptz not null default now(),

  constraint nl_extraction_corrections_type_chk
    check (correction_type in (
      'mention_resolution',
      'mention_dropped',
      'observation_dropped',
      'observation_edited',
      'facet_changed',
      'event_dropped',
      'supersede_rejected',
      'other'
    ))
);

create index nl_extraction_corrections_extraction_idx
  on public.nl_extraction_corrections (extraction_id);

alter table public.nl_extraction_corrections enable row level security;


create table public.eval_cases (
  id              uuid primary key default gen_random_uuid(),
  extraction_id   uuid not null references public.nl_extractions(id) on delete restrict,
  invariants      jsonb not null,
  notes           text,
  tags            text[] not null default '{}',
  priority        int not null default 0,
  eval_runs       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  exported_at     timestamptz
);

create index eval_cases_created_at_idx
  on public.eval_cases (created_at desc);

create index eval_cases_tags_gin
  on public.eval_cases using gin (tags);

alter table public.eval_cases enable row level security;
