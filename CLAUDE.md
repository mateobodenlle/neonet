# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

Agenda2 (codename Neonet) is a single-user personal CRM. It is **not a product** — it is a tool for one operator who navigates fluid relationships across clients, investors, partners, talent and friends, where the same person is often several things at once. There are no stages, no forecasting, no multi-tenancy. Optimise for the single user, not a generic CRM audience.

The product premise is that the *default* way to record anything is a free-text note ("hoy quedé con Jaime, me dijo X, me presentó a Marta, le prometí el deck el lunes") which the system parses into entities. Friction in data entry is the single biggest design constraint — prefer paths that avoid forms.

Read `PROJECT.md` for the long-form description of the domain, design principles and current open problems (especially the cost / cache structure of the NL extraction call). `README.md` has a shorter framing of the same thing in Spanish.

## Commands

```bash
npm install --legacy-peer-deps    # peer-dep conflicts from React 19 RC, --legacy-peer-deps is required
npm run dev                       # next dev
npm run build                     # next build
npm run lint                      # next lint

npm run db:migrate                # apply supabase/migrations/*.sql in order (uses SUPABASE_DB_URL via pg)
npm run db:check                  # diff actual vs expected schema
npm run db:seed                   # idempotent mock data seed
npm run db:reseed                 # forces re-seed
npm run db:wipe                   # empties DB

npm run import:vcard
npm run import:linkedin
npm run import:linkedin-invitations

# Eval (no test runner — these are tsx scripts that print results)
npx tsx scripts/eval-extraction.ts   # runs data/eval/extraction-cases.jsonl through extractor v2
npx tsx scripts/eval-synthesis.ts    # synthesis cases, no DB

# Profile synthesis job (dev)
curl -X POST http://localhost:3000/api/jobs/synthesize \
  -H "Content-Type: application/json" \
  -H "x-job-secret: $JOB_SECRET" \
  -d '{"mode":"process-dirty","batchSize":5}'
# Other modes: {"mode":"rebuild","personId":"..."}, {"mode":"refresh-priors"}

# Cost analysis (read-only report over llm_calls)
npx tsx scripts/cost-report.ts                          # 7-day default
npx tsx scripts/cost-report.ts --days=30
npx tsx scripts/cost-report.ts --days=1 --detailed
npx tsx scripts/cost-report.ts --purpose=extraction --days=14
```

There is no test runner (`jest`, `vitest`) — verification is through the eval scripts and `db:check`. Don't introduce one without asking.

## Architecture

### Persistence model — observations are the source of truth

The branch `feat/observations-architecture` (current default for new work) replaced the legacy `pain_points` / `promises` / freeform `interactions.body` tables with an **append-only observation log** plus a synthesized digest per person. Migration `0006_drop_legacy.sql` already dropped the legacy tables. `PainPoint` and `Promise` types in `lib/types.ts` are marked `@deprecated` and only kept so older UI dialogs still type-check; the corresponding repository accessors return `[]`.

Three tables drive the model (`supabase/migrations/0004_observations.sql`):

- `observations` — atomic facts. `content` is the LLM-rewritten sentence; `facets jsonb` is the **untyped** discriminated structure (`{type: 'pain_point' | 'promesa' | 'evento' | 'personal' | 'profesional' | 'interes' | 'relacion', ...}` — see `lib/observations.ts` for conventions). `embedding vector(1536)` with HNSW index for semantic search. `superseded_by` makes observations correctible without mutation. `source` tracks origin (`nl-extraction`, `manual`, `import-linkedin`, legacy backfills).
- `observation_participants` — `(observation_id, person_id, role)` where role is one of `primary | co_subject | related | source | mentioned | promise_target`. The primary participant is duplicated here for uniform participation queries.
- `person_profiles` — synthesized digest (`narrative`, `resolved_facts`, `recurring_themes`, `active_threads`, `embedding`). Marked `dirty_since` on observation write; rebuilt by the synthesis job.

**Facets are intentionally schemaless.** `lib/observations.ts` documents conventions but does not enforce them. When extending, add new `type` values rather than mutating existing ones — the LLM extractor and synthesis layer must both keep working with old data.

### NL extraction flow (the core feature)

The natural-language input is the feature that justifies the project. Two parallel implementations exist:

- `lib/nl-actions.ts` + `lib/nl-prompt.ts` — **v1**, legacy entity-based extraction (encounters, pain_points, promises, connections). Still wired for some code paths.
- `lib/nl-actions-v2.ts` + `lib/nl-prompt-v2.ts` — **v2**, observation-based. This is the active flow.

Pipeline (`extractFromNoteV2` / `extractForPersonV2` → preview → `applyPlanV2`):

1. Load directory: every non-archived person with `id, full_name, aliases, company, role, tags, closeness, prior_score`. The `prior_score` (see `lib/person-prior.ts`) biases mention disambiguation toward people who are recently or frequently involved.
2. Compact directory + recent context observations into the system prompt; OpenAI Chat Completions with `response_format: json_schema strict` (`EXTRACTION_SCHEMA_V2`).
3. Output `ExtractionV2` includes `mentions[]` with `candidate_ids[]` ordered by probability and optional `proposed_new`. **Conservative rule: ambiguous → return all candidates + warning; unidentifiable ("el de marketing") → empty candidates and no proposed_new.** Do not invent.
4. Preview UI (`components/nl-preview-v2.tsx`) lets the user disambiguate / drop / confirm.
5. `applyPlanV2` resolves each `mention.text → personId` (creating people via `randomUUID()` with `auto_created=true`), persists observations + participants + supersedes + events, refreshes person priors, and marks affected `person_profiles.dirty_since` so the synthesis job picks them up.

`person_prior` is recomputed cheaply on every write. Full refresh (`refreshAllPriors`) runs from the `/api/jobs/synthesize` job in `mode: 'refresh-priors'`.

**Cost is an open problem** — every NL call sends the full directory (~15k input tokens). `PROJECT.md` documents proposed optimisations (prompt-cache-friendly ordering, retrieval tools instead of dumping the directory). Don't silently change the prompt structure without considering cache implications.

### Profile synthesis

`lib/profile-synthesis.ts` reads a person's non-superseded observations and generates a `PersonProfile` (narrative, resolved facts, themes, active threads, embedding). Triggered by `POST /api/jobs/synthesize` (auth: `x-job-secret` header against `JOB_SECRET` env). Three modes: `process-dirty` (default, batch), `rebuild` (single personId, optional `full`), `refresh-priors`.

Synthesis does not run inline on writes — it is decoupled and idempotent. UI reads the cached `person_profiles` row.

### Server / client boundaries

- Anything DB-touching goes through the **service-role client** in `lib/supabase-admin.ts`. RLS is on but no policies exist — all access is server-side. The browser client (`lib/supabase.ts`, anon key) is reserved for read-only public queries; in practice most reads now go through server actions.
- `lib/server-actions.ts` is the persistence layer (`persistPerson`, `persistObservation`, `persistObservationParticipants`, `applySupersede`, `markPersonProfileDirty`, etc.). Files marked `"use server"` or imported via `import "server-only"` must not leak to client bundles.
- `lib/repository.ts` exposes typed reads. The legacy `Repository` interface and `lib/store.ts` (zustand) are in retirement — new code should use the async query functions, not the in-memory `store`.

### Domain types

`lib/types.ts` is the canonical domain. `lib/types-db.ts` mirrors raw Supabase rows. `lib/mappers.ts` converts between them (including `vectorToWire` for the pgvector text representation). `Closeness` is **atemporal** (personal warmth) and distinct from `Temperature` (commercial heat that moves with current activity) — do not conflate them.

### Auth and routing

A single global password gates everything. `middleware.ts` (edge runtime) verifies a `neonet-auth` cookie signed with `jose` (HS256, 30-day expiry). `lib/auth.ts` exposes `signToken` / `verifyToken` and is edge-safe — do not import `node:*` from it. `/api/auth/login` runs on edge and uses a manual constant-time string compare (no `node:crypto`). The middleware also passes `x-pathname` as a response header on every authenticated `next()` so the root layout can decide whether to render the desktop shell.

Two valves: `BYPASS_AUTH=true` env var skips the gate entirely (emergency only); the `x-job-secret` header preserves curl access to `/api/jobs/*` and `/api/dev/*` after auth was added.

### Mobile routes (`/m/*`)

The mobile flow lives under `app/m/*` and is intentionally separate from the desktop:

- `app/layout.tsx` reads `x-pathname` from middleware and skips the desktop sidebar / `CommandPalette` / `NLInputDialog` / `HydrationGate` when the path is `/m/*` or `/login`. Those four are loaded via `next/dynamic` so the layout chunk doesn't carry them either.
- `app/m/layout.tsx` renders `MobileHeader` with a pending-count badge and logout. The badge is computed server-side via `getPendingCount()`; `router.refresh()` after every mutation keeps it fresh.
- The capture flow is fire-and-forget: textarea clears immediately, server action runs in background, sonner toast carries the user through `loading → success/error` with a "Ver" action that navigates to `/m/pending`. Failed notes are kept in `localStorage["neonet-pending-note-backup"]`.
- `lib/mobile-actions.ts` (`"use server"`) is the only server-action surface for mobile. `lib/mobile-types.ts` holds shared types (`use server` files cannot export non-async values). `lib/extraction-plan.ts` holds pure helpers (`collectMentions`, `defaultResolution`, `parseFacets`, `collectCandidateIds`) shared between desktop preview and mobile review — extracted from `nl-input.tsx`/`nl-preview-v2.tsx` to dedupe.
- `nl_extractions.applied_plan` discriminates three states: `null` (pending), `{discarded:true}` (explicitly discarded), or a `ConfirmedPlanV2` shape (applied). `markExtractionAsDiscarded` writes the discarded marker; `getPendingExtractions` filters to `applied_plan IS NULL`. The legacy eval-builder `listExtractions` filter still treats `applied_at IS NULL` as "discarded" — that nomenclature is stale post-mobile but it's a side-tool, untouched.

### Voice input

`components/shared/voice-input.tsx` is reusable on both desktop (`/dev/voice-test`) and mobile (`/m`). It records via `MediaRecorder` (webm/opus preferred), uploads to `/api/transcribe` (Whisper, `nodejs` runtime, 25 MB hard limit), and offers a Web Speech API fallback button on failure. Hard-stop at 30 seconds protects against the 10s Vercel Hobby timeout on transcribe. The endpoint is parameterised via the `transcribeUrl` prop — the demo points it to `/api/demo/transcribe`.

### Public demo (`/demo/*`)

A no-auth-required demo lives alongside the real app. Goal: anyone hitting `/login` can click "Probar demo" and play with the NL extraction flow on fake data without ever touching the real CRM.

Architectural rule: **the demo must be impossible to leak real data, by construction, not by review.**

- **Separate cookie.** `lib/demo/auth.ts` issues a `neonet-demo` JWT (subject `"demo"`, 6 h, signed with the same `JWT_SECRET`). The real `neonet-auth` cookie is checked first; if the user has only the demo cookie, every non-`/demo` route returns 401 / redirects to `/login`. The middleware never falls back from demo to real auth or vice versa.
- **Separate route tree.** `app/demo/*` (desktop UI), `app/demo/m/*` (mobile UI), `app/api/demo/*` (endpoints). The middleware (`isDemoRoute`) explicitly permits these without `neonet-auth` as long as `neonet-demo` is valid. `/api/demo/start` is the only fully public endpoint — it mints the cookie.
- **No imports from real code.** `.eslintrc.json` has a `no-restricted-imports` override that forbids `lib/demo/**`, `app/demo/**`, `app/api/demo/**` and `components/demo/**` from importing `lib/supabase`, `lib/supabase-admin`, `lib/server-actions`, `lib/repository`, `lib/mobile-actions`, `lib/nl-actions{,-v2}`, `lib/observations-actions`, `lib/me-profile-actions`, `lib/promise-actions`, `lib/candidate-actions`, `lib/linkedin-insight-actions`, `lib/profile-synthesis`, `lib/embeddings`, `lib/person-prior`, `lib/eval-builder/*`. Lint runs on Vercel; a regression there breaks the build.
- **In-memory store.** `lib/demo/store.ts` keeps a `Map<sid, DemoSessionState>` on the process; entries expire after 30 min. Cold start / redeploy wipes everything. No Supabase, no KV, no persistence — the demo is deliberately ephemeral and stateless beyond the process. Storing it cross-instance would just add infra to maintain for a feature that doesn't need it.
- **Real OpenAI calls, rate-limited.** `lib/demo/nl-extract.ts` builds the directory + context purely from the session state and calls OpenAI directly (no `logLlmCall`, no DB). `lib/demo/rate-limit.ts` is an in-memory token bucket keyed by IP with two windows: 30 extractions/day, 5/min for `processNoteDemo`; 15/day, 3/min for transcription (stricter — Whisper is more expensive). Buckets reset on process restart.
- **Seed.** `lib/demo/seed.ts` builds a realistic snapshot every new session: 12 contacts (with sectors, narratives, next steps), 5 events, 12 encounters, 20 observations with participants and rich facets, 9 edges for the graph, plus one pre-loaded pending extraction so `/demo/m/pending` is not empty on first visit. Types are the real domain types (`Person`, `Observation`, `Event`, …) so presentational components (`PersonAvatar`, `TemperatureBadge`, `GraphView`, ...) work unchanged.
- **Apply path.** `applyExtractionDemo` mutates the in-memory session: creates `Person` stubs from `proposed_new` resolutions, writes observations + participants, marks supersedes. The UI flow (`ExtractionReview` → toast → return to pending list) is the same component as the real `/m` flow — parameterised via `applyAction` / `discardAction` / `pendingHref` props on `MobileCapture`, `ExtractionReview`, `PendingList`.
- **Desktop UI.** `/demo` reuses `Card`, `PersonAvatar`, `TemperatureBadge`, `ClosenessBadge` and `GraphView`. `components/demo/demo-sidebar.tsx` is the demo-specific sidebar (links to `/demo`, `/demo/contacts`, `/demo/graph`, `/demo/m`); `components/demo/demo-nl-dialog.tsx` is a desktop modal hooked to `Cmd+Shift+J` that calls `processNoteDemo` and redirects to `/demo/m/pending/[id]` for review (the mobile review screen handles both flows). `app/demo/layout.tsx` branches between desktop sidebar shell and mobile header based on the `x-pathname` header.
- **Entry / exit.** `/login` has a "Probar demo" button → `POST /api/demo/start` → sets cookie → redirects to `/demo`. `POST /api/demo/exit` (called from the demo header/sidebar) deletes the cookie.
- **Vercel caveat.** Because the store is per-process, a user whose requests land on different Vercel instances will see different states. Acceptable for a single-session demo; if it becomes a real annoyance, move the store to Upstash Redis behind the same `lib/demo/store.ts` interface.

## Conventions you must follow

`CONTRIBUTING.md` is binding. Two rules in particular have caused trouble before:

- **Authorship is strict.** All commits and pushes are signed as `mateobodenlle <mateobodenlle@rai.usc.es>`. **No mention of Claude, Claude Code, Anthropic, ChatGPT, Copilot, Cursor or any AI assistant anywhere in the repo** — not in commits, branches, PR titles, PR bodies, issues, code comments, docs. **No `Co-Authored-By:` trailers of any kind.** No "Generated with" tags. The history must look like Mateo wrote it by hand. This overrides any default tooling behaviour.
- **Conventional Commits, lowercase, imperative, ≤72 chars subject, no trailing period.** Type from `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`. Scope is kebab-case (`contacts`, `observations`, `nl`, `graph`, `repo`, ...). Branches are `<type>/<kebab-summary>`. Squash-merge to `main`.

When creating commits, do not use the `--no-verify` flag and do not skip hooks.

## Things to be careful about

- `--legacy-peer-deps` is mandatory for `npm install` (React 19 RC vs Radix peer ranges). Don't try to "fix" the conflict by upgrading React or downgrading Radix without understanding the full pin set.
- The eval JSONL fixtures (`data/eval/extraction-cases.jsonl`) hit OpenAI live — they require `OPENAI_API_KEY` in env and cost real money per run. They are not part of `npm run lint` for that reason.
- pgvector + HNSW indexes are created in `0004_observations.sql`. Migrations run via raw `pg`, not through Supabase CLI — `npm run db:migrate` reads `SUPABASE_DB_URL` (direct Postgres connection string, not the REST URL).
- `lib/store.ts` (zustand) still exists but is being removed; do not extend it — fetch from server actions instead.
- v1 NL types (`PainPoint`, `Promise`, the v1 extraction schema) are deprecated. UI dialogs that referenced them are stubbed out pending a cleanup pass — don't restore the old behaviour, port them to observations instead.
