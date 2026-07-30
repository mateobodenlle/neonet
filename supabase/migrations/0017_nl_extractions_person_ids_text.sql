-- 0014 declared subject_person_id/affected_person_ids as uuid/uuid[], but
-- people.id is text (0001, to allow seed ids like 'p1'). Every real person id
-- happens to be a UUID string so the cast worked by accident in production;
-- against seed data the insert fails with "invalid input syntax for type
-- uuid". Align both columns with people.id and with llm_calls.person_ids
-- (0013), which is already text[].
--
-- The GIN index on affected_person_ids is dropped and recreated rather than
-- relying on the implicit index rebuild, so the operator class is chosen for
-- the new column type explicitly.

drop index public.nl_extractions_affected_persons_gin;

alter table public.nl_extractions
  alter column subject_person_id type text using subject_person_id::text;

alter table public.nl_extractions
  alter column affected_person_ids type text[] using affected_person_ids::text[];

create index nl_extractions_affected_persons_gin
  on public.nl_extractions using gin (affected_person_ids);
