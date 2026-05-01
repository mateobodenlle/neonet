-- Atomic merge of two people rows. Reassigns every FK pointing at drop_id
-- to keep_id, deduplicating where uniqueness constraints would conflict, and
-- finally deletes the drop row. Field-level merge (handles, tags, aliases,
-- scalars) is computed in the application layer and applied before this
-- function runs.

create or replace function public.merge_people(keep_id text, drop_id text)
returns void
language plpgsql
as $$
begin
  if keep_id = drop_id then
    raise exception 'cannot merge a person into itself';
  end if;
  if not exists (select 1 from public.people where id = keep_id) then
    raise exception 'keep person % not found', keep_id;
  end if;
  if not exists (select 1 from public.people where id = drop_id) then
    raise exception 'drop person % not found', drop_id;
  end if;

  -- encounters: reassign person_id; rewrite introduced_by_id; null self-refs
  update public.encounters set person_id = keep_id where person_id = drop_id;
  update public.encounters set introduced_by_id = keep_id where introduced_by_id = drop_id;
  update public.encounters set introduced_by_id = null
    where introduced_by_id = keep_id and person_id = keep_id;

  -- interactions
  update public.interactions set person_id = keep_id where person_id = drop_id;

  -- observations
  update public.observations set primary_person_id = keep_id where primary_person_id = drop_id;

  -- observation_participants: drop entries that would duplicate keep's role
  delete from public.observation_participants op
    where op.person_id = drop_id
      and exists (
        select 1 from public.observation_participants op2
        where op2.observation_id = op.observation_id
          and op2.person_id = keep_id
          and op2.role = op.role
      );
  update public.observation_participants set person_id = keep_id where person_id = drop_id;

  -- edges:
  --   1. drop edges that would become self-loops between keep and drop
  delete from public.edges
    where (from_person_id = keep_id and to_person_id = drop_id)
       or (from_person_id = drop_id and to_person_id = keep_id);
  --   2. drop edges from drop that would duplicate one keep already has
  delete from public.edges e
    where e.from_person_id = drop_id
      and exists (
        select 1 from public.edges e2
        where e2.from_person_id = keep_id
          and e2.to_person_id = e.to_person_id
          and e2.kind = e.kind
      );
  delete from public.edges e
    where e.to_person_id = drop_id
      and exists (
        select 1 from public.edges e2
        where e2.to_person_id = keep_id
          and e2.from_person_id = e.from_person_id
          and e2.kind = e.kind
      );
  --   3. reassign survivors
  update public.edges set from_person_id = keep_id where from_person_id = drop_id;
  update public.edges set to_person_id = keep_id where to_person_id = drop_id;

  -- person_profiles: drop's profile dies; keep is marked dirty so the
  -- digest gets resynthesized against the merged observation set.
  delete from public.person_profiles where person_id = drop_id;
  insert into public.person_profiles (person_id, dirty_since)
    values (keep_id, now())
    on conflict (person_id) do update set dirty_since = now();

  -- finally remove the drop row. Nothing else FKs to people.
  delete from public.people where id = drop_id;
end;
$$;
