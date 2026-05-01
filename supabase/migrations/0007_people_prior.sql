-- Person prior score: a 0-ish-to-~7 numeric used to bias mention
-- disambiguation in NL extraction. Refreshed synchronously when an
-- observation lands and periodically by the synthesis job.
--
--   prior_score              composite of closeness + recency + 90d volume
--   last_observation_at      timestamp of the most recent (non-superseded)
--                             observation the person participates in
--   observation_count_90d    rolling 90-day count of participations
--
-- See lib/person-prior.ts for the weight table.

alter table public.people
  add column if not exists prior_score numeric not null default 0,
  add column if not exists last_observation_at timestamptz,
  add column if not exists observation_count_90d integer not null default 0;

create index if not exists people_prior_score_idx
  on public.people(prior_score desc);
