-- Drop legacy pain_points and promises tables.
--
-- All content (which was 0 rows in production at migration time) has been
-- backfilled by scripts/migrate-to-observations.ts into observations with
-- facets.type = 'pain_point' / 'promesa'. UI surfaces still reference these
-- tables in places — those code paths are no-ops post-drop and will be
-- excised in a subsequent UI cleanup PR.
--
-- interactions and encounters are kept.

drop table if exists public.pain_points;
drop table if exists public.promises;
