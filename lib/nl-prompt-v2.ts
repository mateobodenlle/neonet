// Pure module — v2 system prompt + JSON schema for the observation-based
// extraction flow. Imported from the server action and from CLI scripts; must
// not depend on server-only or Next-specific modules.

export const PROMPT_VERSION = 2;

// JSON-schema strict mode forbids arbitrary jsonb. We use a `raw` string
// field that holds JSON for facets, and let the application JSON.parse it.
const facetsField = {
  type: "object",
  additionalProperties: false,
  required: ["raw"],
  properties: {
    raw: {
      type: "string",
      description:
        'JSON-encoded object of facets (free shape). Examples: {"type":"pain_point"}, {"type":"promesa","direction":"yo-a-el","due_date":"2026-05-12"}, {"type":"evento","event_name":"South Summit"}, {"type":"profesional","topic":"cambio-trabajo"}',
    },
  },
} as const;

const mentionField = {
  type: "object",
  additionalProperties: false,
  required: ["text", "candidate_ids", "proposed_new"],
  properties: {
    text: { type: "string" },
    candidate_ids: { type: "array", items: { type: "string" } },
    proposed_new: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["full_name", "role", "company", "notes"],
          properties: {
            full_name: { type: "string" },
            role: { type: ["string", "null"] },
            company: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
        },
        { type: "null" },
      ],
    },
  },
} as const;

export const EXTRACTION_SCHEMA_V2 = {
  name: "extraction_v2",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["observations", "events", "person_updates", "warnings", "summary"],
    properties: {
      observations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "content",
            "observed_at",
            "primary_mention",
            "participants",
            "tags",
            "facets",
            "supersedes_hint",
          ],
          properties: {
            content: { type: "string" },
            observed_at: { type: "string" }, // YYYY-MM-DD
            primary_mention: mentionField,
            participants: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["mention", "role"],
                properties: {
                  mention: mentionField,
                  role: {
                    type: "string",
                    enum: ["co_subject", "related", "source", "mentioned", "promise_target"],
                  },
                },
              },
            },
            tags: { type: "array", items: { type: "string" } },
            facets: facetsField,
            supersedes_hint: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["reason", "candidate_observation_ids"],
                  properties: {
                    reason: { type: "string" },
                    candidate_observation_ids: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                },
                { type: "null" },
              ],
            },
          },
        },
      },
      events: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "date", "location"],
          properties: {
            name: { type: "string" },
            date: { type: "string" },
            location: { type: ["string", "null"] },
          },
        },
      },
      person_updates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["primary_mention", "field", "new_value"],
          properties: {
            primary_mention: mentionField,
            field: {
              type: "string",
              enum: [
                "company",
                "role",
                "location",
                "next_step",
                "interests",
                "tags",
                "category",
                "temperature",
                "closeness",
              ],
            },
            new_value: { type: "string" },
          },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
} as const;

export interface DirectoryRowV2 {
  id: string;
  full_name: string;
  aliases: string[] | null;
  company: string | null;
  role: string | null;
  tags: string[] | null;
  closeness: string | null;
  narrative_snippet: string | null;
}

export function compactDirectoryV2(people: DirectoryRowV2[]): string {
  return people
    .map((p) => {
      const aliases = (p.aliases ?? []).filter(Boolean);
      const namePart = aliases.length
        ? `${p.full_name} (${aliases.join(" / ")})`
        : p.full_name;
      const co = [p.company, p.role].filter(Boolean).join(" – ") || "-";
      const tags = (p.tags ?? []).join(",") || "-";
      const closeness = p.closeness ?? "-";
      const snippet = (p.narrative_snippet ?? "").trim().replace(/\s+/g, " ");
      const tail = snippet ? ` :: ${snippet.slice(0, 140)}` : "";
      return `${p.id} | ${namePart} | ${co} | ${tags} | ${closeness}${tail}`;
    })
    .join("\n");
}

export interface ContextObservation {
  id: string;
  observed_at: string;
  primary_person_full_name: string;
  facet_type: string | null;
  content: string;
}

export function compactContextObservations(rows: ContextObservation[]): string {
  if (rows.length === 0) return "(ninguna observación previa relevante)";
  return rows
    .map((r) => {
      const facet = r.facet_type ? `[${r.facet_type}] ` : "";
      return `${r.id} | ${r.observed_at} | ${r.primary_person_full_name} | ${facet}${r.content}`;
    })
    .join("\n");
}

/**
 * The system prompt is built so the prefix is stable across calls (helps
 * OpenAI cache hit rate). Order: rules → directory → context observations.
 * The volatile parts (today's date, optional subject addendum, the user's
 * note) go in the user message.
 */
export function systemPromptV2(directory: string, contextObs: string): string {
  return [
    "Eres el extractor de entidades para Neonet, el CRM personal de Mateo Bodenlle (cofundador de OSIX Tech y Shearn, basado en Santiago de Compostela).",
    "",
    "Recibirás una nota corta en español (puede mezclar gallego), totalmente desestructurada. Tu trabajo es extraer **observaciones atómicas** sobre personas — un hecho discreto = una observación. NO mezcles hechos en una sola observación.",
    "",
    "## Schema de salida",
    "",
    "- `observations[]`: la unidad central. Cada una con:",
    "  - `content`: el hecho en lenguaje natural, completo y autocontenido (que se entienda sin contexto de la nota).",
    "  - `observed_at`: fecha del hecho YYYY-MM-DD (si la nota dice \"hoy/ayer/lunes\", calcula desde la fecha de hoy del user message).",
    "  - `primary_mention`: a quién va dirigida la observación principalmente (mention = texto del usuario + candidate_ids del directorio + proposed_new si nuevo).",
    "  - `participants[]`: otros involucrados con un rol explícito.",
    "  - `tags[]`: 0-3 etiquetas libres cortas.",
    "  - `facets.raw`: JSON-en-string con la estructura emergente. Convenciones:",
    "    - `{\"type\":\"pain_point\"}` para preocupaciones/problemas.",
    "    - `{\"type\":\"promesa\",\"direction\":\"yo-a-el\"|\"el-a-mi\",\"due_date\":\"YYYY-MM-DD\"|null}` para compromisos.",
    "    - `{\"type\":\"evento\",\"event_name\":\"…\"}` cuando el hecho es \"se conocieron en X\" o \"asistió a X\".",
    "    - `{\"type\":\"personal\",\"topic\":\"familia\"}`, `{\"type\":\"profesional\",\"topic\":\"cambio-trabajo\"}`, `{\"type\":\"interes\",\"topic\":\"running\"}`, `{\"type\":\"relacion\",\"kind\":\"presentado-por\"|\"trabaja-con\"|...}` son orientativos.",
    "    - Si no encaja en nada, `{}` está bien.",
    "  - `supersedes_hint`: opcional. Solo úsalo si ves clara contradicción con una observación previa que aparece en el contexto. Lista los `candidate_observation_ids` y un `reason` corto. La decisión final la toma el usuario.",
    "",
    "- `events[]`: eventos nuevos referenciados (name, date, location).",
    "- `person_updates[]`: cambios a campos resueltos del contacto (role, company, location, next_step, interests, tags, category, temperature, closeness). Solo úsalo cuando la nota cambie un dato estructurado, no para hechos blandos (esos van como observation).",
    "- `warnings[]`: ambigüedades para que el usuario resuelva.",
    "- `summary`: 1 frase corta de qué entendiste.",
    "",
    "## Reglas de roles de participantes",
    "",
    "- Hecho simétrico (\"X y Y son socios\"): primary=X, participants=[(Y, co_subject)].",
    "- Hecho asimétrico (\"X presentó a Y\"): primary=Y (la observación es sobre la presentación de Y), participants=[(X, related)].",
    "- Hecho transmitido (\"X me contó que Y...\"): primary=Y (es sobre Y), participants=[(X, source)].",
    "- Promesa multi-target (\"mando deck a X y Y\"): primary=X, participants=[(Y, promise_target)]. Una sola observation, no dupliques.",
    "",
    "## Resolución de menciones",
    "",
    "- Para cada mention, mira el directorio. Si encaja con uno o varios contactos existentes, pon sus IDs en `candidate_ids` ordenados por probabilidad. Si no hay candidato razonable, `candidate_ids: []` y `proposed_new` con lo que sepas.",
    "- **Conservador**: si \"Pablo\" matchea 5 Pablos, devuelve los 5 — NO elijas. Que decida el usuario.",
    "- Si la mención no tiene nombre identificable (\"el de marketing\", \"su CTO\"), `candidate_ids:[]` y `proposed_new:null`, y mete un warning. NO inventes nombres.",
    "",
    "## Convenciones del usuario",
    "",
    "- Sufijos \"Peleteiro\" en un nombre suelen indicar el colegio donde se conocieron (no apellido).",
    "- Sufijos \"Olimpiada Economía\" indican el evento donde lo conoció.",
    "",
    "## Reglas duras",
    "",
    "- No inventes contexto: si la nota no menciona algo, no lo crees.",
    "- Una observación = un hecho. \"Tiene 3 hijos y vive en Vigo\" → 2 observaciones.",
    "- Direcciones de promesa: `yo-a-el` si Mateo se compromete; `el-a-mi` si la otra parte se compromete con Mateo.",
    "",
    "## Directorio de contactos (id | nombre [/alias] | empresa – rol | tags | closeness :: snippet del perfil)",
    "",
    directory,
    "",
    "## Observaciones previas relevantes (id | fecha | persona principal | [tipo] contenido)",
    "",
    contextObs,
  ].join("\n");
}
