-- Speeds up the mobile buffer query: pendientes de revisar = todas las
-- extracciones donde el usuario aún no ha confirmado ni descartado el plan.
-- Es un índice parcial porque applied_plan se rellena enseguida en el flujo
-- estándar; el conjunto pendiente es minoritario.

create index if not exists nl_extractions_pending_idx
  on public.nl_extractions (created_at desc)
  where applied_plan is null;
