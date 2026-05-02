-- Staging table for LinkedIn connections waiting for manual review.
-- Each row is one connection that did not match an existing person at import
-- time. The user reviews them one by one in /contacts/review and decides:
--   accept  → creates a Person, status='accepted'
--   reject  → status='rejected', never surfaces again
--   merge   → folds into an existing Person, status='merged'
--
-- linkedin_url is the idempotency key: re-importing the same Connections.csv
-- (or a newer one that re-includes the same rows) is safe via ON CONFLICT DO
-- NOTHING — accepted/rejected/merged decisions are preserved.

create table public.connection_candidates (
  id                      text primary key default gen_random_uuid()::text,
  source                  text not null default 'linkedin',
  full_name               text not null,
  first_name              text,
  last_name               text,
  linkedin_url            text not null,
  linkedin_handle         text,
  email                   text,
  company                 text,
  position                text,
  connected_on            date,
  status                  text not null default 'pending'
                          check (status in ('pending','accepted','rejected','merged')),
  created_person_id       text references public.people(id) on delete set null,
  merged_into_person_id   text references public.people(id) on delete set null,
  raw                     jsonb,
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  unique (source, linkedin_url)
);

create index connection_candidates_status_idx
  on public.connection_candidates(status);

alter table public.connection_candidates enable row level security;
