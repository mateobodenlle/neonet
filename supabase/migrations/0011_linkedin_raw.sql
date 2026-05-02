-- Raw LinkedIn messages and comments from the data export. These tables
-- back the on-demand "Generate insight" feature on the contact detail
-- page — they're the source of truth for searching DMs by handle and
-- comments by name. NOT consumed by the regular extraction flow.
--
-- Idempotency: each table has a UNIQUE tuple over the natural identity of
-- a row (conversation/date/sender for messages; date/link/message for
-- comments). Re-importing the same export is safe; importing a fresh
-- export incrementally adds new rows.

create table public.linkedin_messages_raw (
  id                      text primary key default gen_random_uuid()::text,
  conversation_id         text,
  conversation_title      text,
  from_name               text not null,
  sender_profile_url      text,
  sender_handle           text,                 -- normalized lowercase handle
  to_names                text,                 -- raw "; " joined list
  recipient_profile_urls  text,                 -- raw " " joined list
  recipient_handles       text[] not null default '{}',
  date                    timestamptz not null,
  subject                 text,
  content                 text,
  folder                  text,
  source_export           text,
  imported_at             timestamptz not null default now(),
  unique (conversation_id, date, from_name)
);

create index linkedin_messages_sender_handle_idx
  on public.linkedin_messages_raw(sender_handle);
create index linkedin_messages_recipient_handles_idx
  on public.linkedin_messages_raw using gin (recipient_handles);
create index linkedin_messages_date_idx
  on public.linkedin_messages_raw(date desc);

create table public.linkedin_comments_raw (
  id                      text primary key default gen_random_uuid()::text,
  date                    timestamptz not null,
  link                    text,
  message                 text not null,
  source_export           text,
  imported_at             timestamptz not null default now(),
  unique (date, link, message)
);

create index linkedin_comments_date_idx
  on public.linkedin_comments_raw(date desc);

alter table public.linkedin_messages_raw enable row level security;
alter table public.linkedin_comments_raw enable row level security;
