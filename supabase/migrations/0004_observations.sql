-- Observations architecture: append-only atomic facts + synthesized profile
-- per person + semantic embeddings.
--
-- See PROJECT.md / lib/observations.ts for the conceptual model. Existing
-- legacy tables (pain_points, promises, interactions) stay in place for now
-- — they are migrated in scripts/migrate-to-observations.ts and dropped in a
-- later migration once the new flow is live.

create extension if not exists vector;

-- people: track contacts created automatically by NL extraction so we can
-- distinguish them from manually curated rows.
alter table public.people
  add column if not exists auto_created boolean not null default false;

-- observations -----------------------------------------------------------
create table public.observations (
  id                  text primary key default gen_random_uuid()::text,
  primary_person_id   text not null references public.people(id) on delete cascade,
  content             text not null,
  observed_at         date not null,
  source              text not null,                          -- 'nl-extraction' | 'manual' | 'import-linkedin' | 'legacy-pain-point' | 'legacy-promise' | 'legacy-interaction'
  tags                text[] not null default '{}',
  facets              jsonb not null default '{}'::jsonb,
  superseded_by       text references public.observations(id) on delete set null,
  embedding           vector(1536),
  embedding_model     text,
  created_at          timestamptz not null default now()
);

create index observations_primary_person_idx
  on public.observations(primary_person_id);
create index observations_observed_at_idx
  on public.observations(observed_at desc);
create index observations_facets_gin
  on public.observations using gin (facets);
create index observations_tags_gin
  on public.observations using gin (tags);

-- HNSW vector index. cosine distance (`<=>`) matches the OpenAI embedding
-- conventions. m=16, ef_construction=64 are pgvector defaults aimed at
-- balanced recall vs build-time. Adjust later if recall is poor.
create index observations_embedding_hnsw
  on public.observations using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- observation_participants ----------------------------------------------
-- One row per (observation, person, role). primary_person_id on observations
-- is duplicated here with role='primary' for uniform participation queries.
create table public.observation_participants (
  observation_id  text not null references public.observations(id) on delete cascade,
  person_id       text not null references public.people(id) on delete cascade,
  role            text not null check (
    role in ('primary','co_subject','related','source','mentioned','promise_target')
  ),
  primary key (observation_id, person_id, role)
);

create index observation_participants_person_idx
  on public.observation_participants(person_id);

-- person_profiles -------------------------------------------------------
-- Synthesized digest per person. Regenerated on a dirty flag.
create table public.person_profiles (
  person_id                     text primary key references public.people(id) on delete cascade,
  narrative                     text not null default '',
  resolved_facts                jsonb not null default '{}'::jsonb,
  recurring_themes              text[] not null default '{}',
  active_threads                jsonb not null default '[]'::jsonb,
  embedding                     vector(1536),
  embedding_model               text,
  last_synthesized_at           timestamptz,
  observations_at_synthesis     integer not null default 0,
  dirty_since                   timestamptz,
  updated_at                    timestamptz not null default now()
);

create index person_profiles_dirty_idx
  on public.person_profiles(dirty_since)
  where dirty_since is not null;

create index person_profiles_embedding_hnsw
  on public.person_profiles using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create trigger touch_person_profiles_updated
before update on public.person_profiles
for each row execute function public.touch_updated_at();

-- RLS: same policy as the rest — enabled, no policies, server-only access.
alter table public.observations              enable row level security;
alter table public.observation_participants  enable row level security;
alter table public.person_profiles           enable row level security;
