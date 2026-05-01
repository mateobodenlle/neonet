-- search_observations: HNSW-backed cosine-similarity KNN over observations,
-- optionally filtered to observations the given person participates in.
--
-- Returns one row per observation: { observation: jsonb, score: float }.
-- score is 1 - cosine_distance, so higher = more similar (range ~[-1, 1],
-- typically [0, 1] for OpenAI embeddings).

create or replace function public.search_observations(
  query_embedding   vector(1536),
  match_limit       int default 10,
  filter_person_id  text default null,
  min_score         float default 0
)
returns table (observation jsonb, score float)
language sql stable
as $$
  with candidates as (
    select o.*, 1 - (o.embedding <=> query_embedding) as score
    from public.observations o
    where o.embedding is not null
      and o.superseded_by is null
      and (
        filter_person_id is null
        or exists (
          select 1 from public.observation_participants p
          where p.observation_id = o.id and p.person_id = filter_person_id
        )
      )
    order by o.embedding <=> query_embedding
    limit match_limit * 4
  )
  select to_jsonb(c) - 'score' as observation, c.score
  from candidates c
  where c.score >= min_score
  order by c.score desc
  limit match_limit;
$$;
