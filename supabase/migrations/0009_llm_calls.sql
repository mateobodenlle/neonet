-- Append-only log of every OpenAI call (chat completion or embedding).
-- Lets us answer "how much did synthesis cost this week" and "what's the
-- cache hit rate on extraction" without scraping the OpenAI dashboard.

create table public.llm_calls (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  purpose             text not null,
  model               text not null,
  prompt_tokens       int,
  cached_tokens       int,
  completion_tokens   int,
  total_tokens        int,
  duration_ms         int,
  cost_usd_estimated  numeric(10, 6),
  success             boolean not null default true,
  error_message       text,
  person_ids          text[] not null default '{}',
  metadata            jsonb not null default '{}'::jsonb,
  constraint llm_calls_purpose_chk check (purpose in (
    'extraction',
    'extraction-for-person',
    'synthesis-incremental',
    'synthesis-rebuild',
    'embedding-observation',
    'embedding-profile',
    'embedding-query',
    'rerank',
    'other'
  ))
);

create index llm_calls_purpose_created_at_idx
  on public.llm_calls (purpose, created_at desc);

create index llm_calls_created_at_idx
  on public.llm_calls (created_at desc);

-- RLS: same policy as the rest — enabled, no policies, server-only access.
alter table public.llm_calls enable row level security;
