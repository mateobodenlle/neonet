// Pure module — system prompt + JSON schema for the NL extraction. Imported
// from both the server action (lib/nl-actions.ts) and CLI smoke tests, so it
// must NOT depend on server-only or any Next-specific module.

export const EXTRACTION_SCHEMA = {
  name: "extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["mentions", "encounters", "pain_points", "promises", "person_updates", "connections", "events", "warnings", "summary"],
    properties: {
      mentions: {
        type: "array",
        items: {
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
        },
      },
      encounters: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["person_text", "date", "location", "context", "event_name"],
          properties: {
            person_text: { type: "string" },
            date: { type: "string" },
            location: { type: ["string", "null"] },
            context: { type: "string" },
            event_name: { type: ["string", "null"] },
          },
        },
      },
      pain_points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["person_text", "description"],
          properties: {
            person_text: { type: "string" },
            description: { type: "string" },
          },
        },
      },
      promises: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["person_text", "description", "direction", "due_date"],
          properties: {
            person_text: { type: "string" },
            description: { type: "string" },
            direction: { type: "string", enum: ["yo-a-el", "el-a-mi"] },
            due_date: { type: ["string", "null"] },
          },
        },
      },
      person_updates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["person_text", "field", "new_value"],
          properties: {
            person_text: { type: "string" },
            field: {
              type: "string",
              enum: ["company", "role", "location", "next_step", "interests", "tags", "category", "temperature"],
            },
            new_value: { type: "string" },
          },
        },
      },
      connections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from_person_text", "to_person_text", "kind", "note"],
          properties: {
            from_person_text: { type: "string" },
            to_person_text: { type: "string" },
            kind: {
              type: "string",
              enum: ["presentado-por", "conoce", "trabaja-con", "familiar", "inversor-de"],
            },
            note: { type: ["string", "null"] },
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
      warnings: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
} as const;

export interface DirectoryRow {
  id: string;
  full_name: string;
  aliases: string[] | null;
  company: string | null;
  role: string | null;
  tags: string[] | null;
}

export function compactDirectory(people: DirectoryRow[]): string {
  return people
    .map((p) => {
      const aliases = (p.aliases ?? []).filter(Boolean);
      const namePart = aliases.length ? `${p.full_name} (${aliases.join(" / ")})` : p.full_name;
      const co = [p.company, p.role].filter(Boolean).join(" – ") || "-";
      const tags = (p.tags ?? []).join(",") || "-";
      return `${p.id} | ${namePart} | ${co} | ${tags}`;
    })
    .join("\n");
}

export function systemPrompt(today: string, directory: string): string {
  return [
    "Eres el extractor de entidades para Neonet, el CRM personal de Mateo Bodenlle (cofundador de OSIX Tech y Shearn, basado en Santiago de Compostela).",
    `Hoy es ${today}.`,
    "",
    "Recibirás una nota corta en español (puede mezclar gallego), totalmente desestructurada, con cosas que han pasado: encuentros, conversaciones, contactos nuevos, actualizaciones de gente que ya conoce, eventos, etc.",
    "",
    "Tu trabajo es extraer hechos en el JSON estricto del schema, **sin perder información** y **sin inventar nada**. Reglas:",
    "",
    "1. Para cada persona referenciada en la nota, crea una `mention` con el texto exacto (ej. \"Pablo\", \"Lucía Fernández\", \"el de Idealista\").",
    "2. Para cada `mention`, mira la lista de contactos existentes del usuario que va abajo. Si el texto puede mapear con uno o varios contactos existentes, pon sus IDs en `candidate_ids` ordenados por probabilidad. Si no hay candidato razonable, deja `candidate_ids` vacío y rellena `proposed_new` con lo que sepas.",
    "3. **Conservador con la disambiguación**: si una mención es solo \"Pablo\" y hay 5 Pablos, devuelve los 5 candidatos — NO elijas uno. Que decida el usuario.",
    "4. Convenciones de naming del usuario:",
    "   - El sufijo `Peleteiro` en un nombre suele indicar el colegio donde se conocieron, no apellido.",
    "   - El sufijo `Olimpiada Economía` indica el evento donde lo conoció.",
    "5. Las fechas siempre en formato YYYY-MM-DD. Si la nota dice \"hoy\", \"ayer\", \"el lunes\", calcúlalo desde hoy y devuélvelo absoluto.",
    "6. `direction` de promesas: `yo-a-el` si Mateo prometió algo, `el-a-mi` si la otra persona se comprometió a algo con Mateo.",
    "7. `connections.kind` solo puede ser uno de: `presentado-por`, `conoce`, `trabaja-con`, `familiar`, `inversor-de`. Si la nota dice \"X me presentó a Y\", crea `from=Y, to=X, kind=presentado-por` (Y fue presentado por X).",
    "8. **No inventes contexto**: si la nota no menciona un pain point, no lo crees. Mejor dejar el array vacío que rellenar con suposiciones.",
    "9. `warnings`: usa este array para flagear cualquier ambigüedad que el usuario debería resolver (ej. \"Hay 5 Pablos en tu red, no pude desambiguar\").",
    "10. **Acciones que involucran a varias personas**: si una sola promesa, encuentro o pain point afecta a varias personas (ej. \"le mando el deck a Pablo y a Judit\", \"quedé con A y B\", \"a los dos les preocupa la migración\"), emite **una entrada por persona** en el array correspondiente, replicando el contexto. La estructura es 1 fila = 1 persona; si un compromiso es con 3 personas, hay 3 filas.",
    "11. **Si una mención no tiene un nombre identificable** (\"el de marketing\", \"su CTO\", \"un amigo\"), deja `candidate_ids` vacío Y `proposed_new` en null, y mete un warning. NO inventes nombres como \"CTO de X\".",
    "",
    "## Contactos existentes del usuario (id | nombre [/alias] | empresa – rol | tags)",
    "",
    directory,
  ].join("\n");
}
