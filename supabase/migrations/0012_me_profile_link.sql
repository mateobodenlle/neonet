-- Link the single me_profile row to the People row that represents the user.
-- Used by the NL flow to exclude the user from the directory shown to the
-- model, preventing self-referential extractions ("Mateo me dijo X" being
-- resolved as an observation about a Mateo contact).
--
-- Importers that detect the user's vCard / LinkedIn entry can also use this
-- to skip creating duplicate rows in the future.

alter table public.me_profile
  add column if not exists linked_person_id text
    references public.people(id) on delete set null;

create index if not exists me_profile_linked_person_idx
  on public.me_profile(linked_person_id);
