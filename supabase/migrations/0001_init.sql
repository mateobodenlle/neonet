-- Initial schema for neonet
-- Mirrors lib/types.ts. Text PKs allow seeding with the existing mock IDs
-- ("p1", "e1", "en1", ...) while new rows default to UUIDs.
--
-- Security model (MVP, single user):
--   - RLS is ENABLED on every table.
--   - No policies are defined, so the anon role has no access.
--   - All reads/writes go through the server using the service_role key.
--   - TODO: when adding auth, add an owner_id column and per-user policies.

create extension if not exists pgcrypto;

-- people ----------------------------------------------------------------
create table public.people (
  id              text primary key default gen_random_uuid()::text,
  full_name       text not null,
  aliases         text[] not null default '{}',
  photo_url       text,
  role            text,
  company         text,
  sector          text,
  seniority       text,
  location        text,
  handles         jsonb,
  category        text not null,
  temperature     text not null,
  tags            text[] not null default '{}',
  interests       text[] not null default '{}',
  affinity        smallint check (affinity between 1 and 5),
  trust           smallint check (trust between 1 and 5),
  next_step       text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- events ----------------------------------------------------------------
create table public.events (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  location        text,
  date            date not null,
  end_date        date,
  notes           text,
  created_at      timestamptz not null default now()
);

-- encounters ------------------------------------------------------------
create table public.encounters (
  id                  text primary key default gen_random_uuid()::text,
  person_id           text not null references public.people(id) on delete cascade,
  event_id            text references public.events(id) on delete set null,
  date                date not null,
  location            text,
  context             text,
  introduced_by_id    text references public.people(id) on delete set null,
  created_at          timestamptz not null default now()
);

-- interactions ----------------------------------------------------------
create table public.interactions (
  id              text primary key default gen_random_uuid()::text,
  person_id       text not null references public.people(id) on delete cascade,
  kind            text not null,
  date            date not null,
  summary         text not null,
  body            text,
  encounter_id    text references public.encounters(id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- pain_points -----------------------------------------------------------
create table public.pain_points (
  id                      text primary key default gen_random_uuid()::text,
  person_id               text not null references public.people(id) on delete cascade,
  description             text not null,
  source_encounter_id     text references public.encounters(id) on delete set null,
  source_interaction_id   text references public.interactions(id) on delete set null,
  resolved                boolean not null default false,
  created_at              timestamptz not null default now()
);

-- promises --------------------------------------------------------------
create table public.promises (
  id              text primary key default gen_random_uuid()::text,
  person_id       text not null references public.people(id) on delete cascade,
  description     text not null,
  direction       text not null check (direction in ('yo-a-el','el-a-mi')),
  due_date        date,
  done            boolean not null default false,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- edges -----------------------------------------------------------------
create table public.edges (
  id                  text primary key default gen_random_uuid()::text,
  from_person_id      text not null references public.people(id) on delete cascade,
  to_person_id        text not null references public.people(id) on delete cascade,
  kind                text not null,
  note                text,
  created_at          timestamptz not null default now(),
  unique (from_person_id, to_person_id, kind)
);

-- indexes ---------------------------------------------------------------
create index encounters_person_id_idx     on public.encounters(person_id);
create index encounters_event_id_idx      on public.encounters(event_id);
create index interactions_person_id_idx   on public.interactions(person_id);
create index pain_points_person_id_idx    on public.pain_points(person_id);
create index promises_person_id_idx       on public.promises(person_id);
create index edges_from_idx               on public.edges(from_person_id);
create index edges_to_idx                 on public.edges(to_person_id);

-- updated_at trigger ----------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_people_updated
before update on public.people
for each row execute function public.touch_updated_at();

-- row-level security ----------------------------------------------------
alter table public.people       enable row level security;
alter table public.events       enable row level security;
alter table public.encounters   enable row level security;
alter table public.interactions enable row level security;
alter table public.pain_points  enable row level security;
alter table public.promises     enable row level security;
alter table public.edges        enable row level security;
