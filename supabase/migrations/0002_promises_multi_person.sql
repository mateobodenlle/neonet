-- A promise can apply to several people at once ("le mando el deck a Pablo y
-- a Judit") and the user wants a single row + single toggle, not one row per
-- person. Add an array of additional person IDs alongside the primary one.
--
-- Why an array column instead of a join table: the read pattern is "pull all
-- promises and rendered the linked names" — array fits in the row, no JOIN
-- needed, simpler mappers. If the cardinality grows we can normalise later.

alter table public.promises
  add column also_person_ids text[] not null default '{}';

create index promises_also_person_ids_gin on public.promises using gin (also_person_ids);
