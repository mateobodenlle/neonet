-- Closeness — an atemporal, granular measure of how personally close the
-- user is to a contact. Distinct from `temperature`, which is the *current*
-- commercial temperature and changes with conversation cadence. Closeness
-- doesn't drop when you stop talking for six months.

alter table public.people
  add column closeness text;

create index people_closeness_idx on public.people(closeness)
  where closeness is not null;
