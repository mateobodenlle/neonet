-- Single-row table that holds the LinkedIn data export about *you* (Mateo).
-- Fed by scripts/import-linkedin-self.ts. Used by NL prompts to ground
-- entity disambiguation, and by a future settings page.
--
-- The id='me' check + primary key enforces the single-row invariant.

create table public.me_profile (
  id                  text primary key default 'me' check (id = 'me'),

  first_name          text,
  last_name           text,
  maiden_name         text,
  headline            text,
  summary             text,
  industry            text,
  location            text,
  address             text,
  zip_code            text,
  birth_date          text,        -- LinkedIn gives "Dec 25" without a year

  twitter_handles     text[] not null default '{}',
  websites            text[] not null default '{}',
  instant_messengers  text[] not null default '{}',

  positions           jsonb not null default '[]'::jsonb,
  education           jsonb not null default '[]'::jsonb,
  skills              text[] not null default '{}',
  honors              jsonb not null default '[]'::jsonb,
  languages           jsonb not null default '[]'::jsonb,
  projects            jsonb not null default '[]'::jsonb,
  courses             jsonb not null default '[]'::jsonb,
  learning            jsonb not null default '[]'::jsonb,

  phone_numbers       jsonb not null default '[]'::jsonb,
  emails              jsonb not null default '[]'::jsonb,

  jobs_preferences    jsonb,

  registered_at       timestamptz,
  registration_ip     text,
  subscription_types  text[] not null default '{}',

  source              text not null default 'linkedin',
  imported_at         timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger touch_me_profile_updated
before update on public.me_profile
for each row execute function public.touch_updated_at();

alter table public.me_profile enable row level security;
