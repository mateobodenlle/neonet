-- Add 'transcription' to the llm_calls.purpose CHECK constraint.
--
-- The TS LlmPurpose union (lib/llm-observability.ts) and the /api/transcribe
-- route already write purpose='transcription', but the 0013 constraint never
-- allowed it — so every real transcription INSERT violated the CHECK and was
-- silently swallowed by logLlmCall (a console error fired on every successful
-- transcription, and the cost/latency was never recorded). Recreate the
-- constraint with the value included.

alter table public.llm_calls
  drop constraint llm_calls_purpose_chk;

alter table public.llm_calls
  add constraint llm_calls_purpose_chk check (purpose in (
    'extraction',
    'extraction-for-person',
    'synthesis-incremental',
    'synthesis-rebuild',
    'embedding-observation',
    'embedding-profile',
    'embedding-query',
    'rerank',
    'transcription',
    'other'
  ));
