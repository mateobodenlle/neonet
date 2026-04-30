# Neonet (Agenda2) — Project Overview

CRM personal de Mateo Bodenlle (cofundador de OSIX Tech y Shearn, Santiago de Compostela). No es producto: es una herramienta interna construida porque los CRM estándar (HubSpot, Pipedrive, Folk, Attio) están pensados para equipos de ventas con proceso definido, no para un operador que navega relaciones fluidas entre clientes, inversores, partners, talento y amigos — donde a menudo la misma persona es varias cosas a la vez.

## Problema que resuelve

Genera muchos contactos nuevos cada semana en eventos de emprendimiento (South Summit, 4YFN, cenas de founders, cafés, reuniones). Cada encuentro deja información útil — pain points, proyectos, conexiones, promesas — que hoy vive en su cabeza y notas sueltas. Resultado: a los 3 meses la conversación arranca de cero cuando debería arrancar donde la dejó.

## Principios de diseño

1. **Entrada en lenguaje natural** como modo por defecto. No formularios — caja de texto donde escribe "hoy quedé con Jaime, me dijo X, me presentó a Marta, le prometí el deck el lunes" y la herramienta extrae mentions, encounters, pain points, promises, connections.
2. **Cada persona es un dossier vivo**: encuentros, pain points fechados, promesas en ambas direcciones, intereses, quién la presentó, cercanía atemporal, temperatura comercial.
3. **Grafo de conexiones** — "¿quién de los míos conoce a X?", "¿en qué evento nos conocimos?".
4. **Briefing pre-reunión** en 3 segundos: última conversación, pain points pendientes, promesas abiertas.
5. **Consulta en lenguaje natural** (futura) — semántica sobre texto libre de notas.

Lo que **no** es: CRM de ventas con stages/forecasting, multi-usuario, replacement de teléfono o LinkedIn. Es la capa de memoria que falta entre esas cosas.

## Stack

- **Next.js 15** (App Router, RSC, server actions) + React 19 RC.
- **TypeScript** estricto.
- **Tailwind CSS** + Radix UI primitives + componentes locales en `components/ui`.
- **Supabase** (Postgres) — `@supabase/supabase-js` v2. Service role en server, anon key en cliente.
- **OpenAI** SDK v6 — extracción NL (`gpt-4o` por defecto, configurable via `OPENAI_EXTRACTION_MODEL`).
- **Zustand** para estado cliente puntual (en transición a server-fetched).
- **`@xyflow/react`** para el grafo.
- **`cmdk`** para command palette (Cmd-K global).
- **`sonner`** para toasts.
- **`tsx`** + **`pg`** para scripts CLI (migrate / seed / wipe / imports).

## Layout del repo

```
app/                Next App Router
  page.tsx          Home (timeline / dashboard)
  contacts/         Lista + detalle de personas
    [id]/page.tsx   Ficha rica con NL input por persona
  events/           Eventos con la gente que coincidió
  graph/            Vista de grafo de conexiones
  layout.tsx, globals.css

components/         UI compuesta
  ui/               Primitives (button, dialog, popover, command, ...)
  nl-input*.tsx     Caja NL global / por-persona / preview
  add-*-dialog.tsx  Diálogos de alta manuales
  graph-view.tsx    Wrapper de xyflow
  command-palette.tsx
  category-badge.tsx, closeness-badge.tsx, temperature-badge.tsx, ...

lib/                Lógica compartida (NO server-only salvo donde se indica)
  types.ts          Tipos de dominio (Person, Encounter, Promise, ...)
  types-db.ts       Tipos crudos de las filas de Supabase
  mappers.ts        DB row ↔ dominio
  repository.ts     Reads tipados desde Supabase
  server-actions.ts persistPerson / persistEncounter / persistPromise / ...
  actions.ts        Server actions de UI (delete, archive, ...)
  store.ts          Zustand store (legacy, en retirada)
  supabase.ts       Cliente browser (anon)
  supabase-admin.ts Cliente server (service role)
  openai.ts         Cliente OpenAI + EXTRACTION_MODEL
  nl-prompt.ts      Schema JSON estricto + system prompt + compactDirectory
  nl-actions.ts     extractFromNote / extractForPerson / applyPlan
  nl-types.ts       Tipos del payload de extracción
  mock-data.ts      Dataset de seed
  utils.ts          cn() y helpers

supabase/migrations/
  0001_init.sql                    Schema base
  0002_promises_multi_person.sql   alsoPersonIds
  0003_people_closeness.sql        Closeness atemporal

scripts/            CLI ops
  migrate.ts, check-schema.ts, seed.ts, wipe.ts
  import-vcard.ts, import-linkedin.ts, import-linkedin-invitations.ts
  find-duplicates.ts, lib/, one-shot/

data/               Fuentes de ingesta (vcard, LinkedIn export)
```

## Modelo de dominio

Definido en `lib/types.ts`:

- **Person** — `fullName`, `aliases`, `role`, `company`, `sector`, `seniority`, `location`, `handles` (linkedin/instagram/twitter/email/phone/website), `category` (cliente-potencial/cliente/inversor/partner/talento/amigo/otro), `temperature` (frio/tibio/caliente — comercial), `closeness` (desconocido → mejor-amigo, **atemporal**, distinta de temperature), `tags`, `interests`, `affinity` (1-5), `trust` (1-5), `nextStep`, `archived`.
- **Event** — `name`, `location`, `date`, `endDate`, `notes`.
- **Encounter** — vínculo persona+evento+fecha+contexto. Genera siempre una `Interaction` derivada.
- **Interaction** — `kind` (encuentro/llamada/email/mensaje/reunion/nota), `summary`, `body`, `encounterId?`.
- **PainPoint** — texto libre asociado a una persona, fechado, opcionalmente resoluble.
- **Promise** — `direction` (`yo-a-el` | `el-a-mi`), `dueDate`, `done`, `personId` primario + `alsoPersonIds[]` (una sola promesa multi-destinatario que se cumple a la vez para todos).
- **Edge** — arista del grafo. `kind`: `conoce | trabaja-con | familiar | presentado-por | inversor-de`.

## Flujo de extracción NL (corazón del producto)

1. Usuario escribe nota desestructurada en `components/nl-input*.tsx`.
2. Server action `extractFromNote(text, today)` (o `extractForPerson` con sujeto implícito):
   - `loadDirectory()` lee TODOS los contactos no archivados (`SELECT id, full_name, aliases, company, role, tags`).
   - `compactDirectory()` los serializa a una línea por contacto: `id | nombre (alias) | empresa – rol | tags`.
   - `systemPrompt(today, directory)` construye el prompt con reglas (convenciones de naming, fechas YYYY-MM-DD, dirección de promesas, multi-persona en una sola promesa, no inventar contexto).
   - Llamada a OpenAI Chat Completions con `response_format: json_schema strict` (`EXTRACTION_SCHEMA`).
3. Devuelve `Extraction` con: `mentions[]` (cada una con `candidate_ids[]` ordenados por probabilidad y opcional `proposed_new`), `encounters[]`, `pain_points[]`, `promises[]`, `person_updates[]`, `connections[]`, `events[]`, `warnings[]`, `summary`.
4. UI de preview (`nl-preview.tsx`) muestra el draft. Usuario desambigua mentions ambiguas, descarta lo que sobra, confirma.
5. `applyPlan(plan)` resuelve `mention.text → personId` (creando personas nuevas con `randomUUID()`), ordena escrituras (events → person_updates → encounters → pain_points → promises → connections) y persiste vía las `persist*` de `server-actions.ts`.

**Reglas no inventar / conservador**: si la mención es ambigua, devolver todos los candidatos y un warning; si no hay nombre identificable ("el de marketing"), `candidate_ids=[]` y `proposed_new=null`.

## Coste actual y problema abierto

- Cada nota envía el directorio completo (~15k input tokens) en cada llamada → ~€0.045/nota con `gpt-4o`.
- Diseño actual: `today` interpolado al inicio del system prompt rompe el prefijo cacheable.
- Compactación del directorio omite señales clave (`closeness`, observaciones libres) que la IA necesita para desambiguar bien.

**Optimizaciones propuestas** (no implementadas, pendientes de aprobación): migrar a `gpt-4.1` (75% cache discount), reordenar prompt para maximizar prefijo estable, añadir `prompt_cache_key`, exponer tools `get_contact_full(id)` y `search_contacts_by_observation(query)` para retrieval bajo demanda en vez de mandar todo siempre. Ver discusión en `lib/nl-actions.ts` y `lib/nl-prompt.ts`.

## Setup local

```bash
git clone https://github.com/mateobodenlle/neonet.git
cd neonet
git checkout feat/nl-input
# colocar .env.local manualmente (gitignored, no en el repo)
npm install --legacy-peer-deps
npm run db:migrate
npm run db:seed
npm run dev
```

### Variables de entorno (`.env.local`)

| Variable | Scope | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | público | cliente browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | público | cliente browser |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | bypass RLS en scripts y server actions |
| `SUPABASE_DB_URL` | server-only | connection string Postgres directa para `db:migrate` |
| `OPENAI_API_KEY` | server-only | extracción NL |
| `OPENAI_EXTRACTION_MODEL` | server-only opcional | default `gpt-4o` |

### Scripts CLI

- `npm run db:migrate` — aplica `supabase/migrations/*.sql` en orden.
- `npm run db:check` — diff entre schema actual y esperado.
- `npm run db:seed` / `db:reseed` — carga dataset mock (idempotente / fuerza re-seed).
- `npm run db:wipe` — vacía la BD.
- `npm run import:vcard` — importa `data/contacts.vcf`.
- `npm run import:linkedin` — importa export de LinkedIn (`data/linkedin/`).
- `npm run import:linkedin-invitations` — importa pendientes/aceptadas de invitaciones.

## Estado actual

**Funcional**: contactos con ficha editable, eventos con asistentes, grafo de conexiones, pendientes con undo, pain points, timeline unificado, command palette, archive, NL input global y por-persona, multi-persona promises, closeness atemporal, persistencia real en Supabase, importers LinkedIn + vCard.

**Pendiente** (en orden aproximado de prioridad):
- Optimización de coste del NL extraction (cache + tools + densificación).
- App móvil Android con voice-first (grabas 30s saliendo de un café, transcripción + extracción).
- Consulta NL semántica sobre notas (embeddings + rerank).
- Briefing pre-reunión automatizado.

## Convenciones

Ver `CONTRIBUTING.md` para estándares de commits, branching, versionado y autoría.

## Rama actual

`feat/observations-architecture` — refactor mayor: append-only `observations` + `observation_participants` + `person_profiles` con embeddings (pgvector HNSW). Extracción NL v2 emite observaciones atómicas con facets libres + roles de participantes + supersedes. Síntesis de perfil vía endpoint `/api/jobs/synthesize`. Tablas legacy `pain_points` / `promises` eliminadas (migración 0006); UI dialogs/listas que las usaban quedan como vacías hasta UI cleanup posterior.

### Eval

- `npx tsx scripts/eval-extraction.ts` — corre `data/eval/extraction-cases.jsonl` contra el extractor v2 y valida observaciones, mentions, facets y person_updates esperados.
- `npx tsx scripts/eval-synthesis.ts` — corre casos de síntesis sintética sin tocar BD.

### Job de síntesis

```bash
curl -X POST http://localhost:3000/api/jobs/synthesize \
  -H "Content-Type: application/json" \
  -H "x-job-secret: $JOB_SECRET" \
  -d '{"mode":"process-dirty","batchSize":5}'
```
