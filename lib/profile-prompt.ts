// Pure module — synthesis prompt + JSON schema. Imported from server-side
// synthesis (lib/profile-synthesis.ts) and from CLI eval scripts, so it must
// not depend on server-only or Next-specific APIs.

export const PROFILE_SCHEMA = {
  name: "person_profile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["narrative", "resolved_facts", "recurring_themes", "active_threads"],
    properties: {
      narrative: { type: "string" },
      resolved_facts: {
        type: "object",
        additionalProperties: false,
        required: ["raw"],
        properties: {
          // We can't predict which facts the LLM will surface (vegetariano,
          // habla portugués, vive en X). Wrap in a `raw` jsonb-as-string so
          // strict mode is satisfied; we'll JSON.parse on read.
          raw: { type: "string" },
        },
      },
      recurring_themes: {
        type: "array",
        items: { type: "string" },
      },
      active_threads: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "status"],
          properties: {
            title: { type: "string" },
            status: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export interface SynthesisObservationLine {
  id: string;
  observed_at: string;
  content: string;
  facetType: string | null;
  source: string;
}

export function profileSystemPrompt(today: string): string {
  return [
    "Eres el sintetizador del perfil de una persona dentro de Neonet, el CRM personal de Mateo Bodenlle.",
    `Hoy es ${today}.`,
    "",
    "Recibirás:",
    "  - Datos básicos resueltos de la persona (nombre, empresa, rol, ubicación, etiquetas).",
    "  - El narrative anterior (si existe).",
    "  - Una lista de observaciones atómicas en orden cronológico inverso (más recientes primero).",
    "",
    "Tu trabajo es producir un perfil sintético denso pero compacto, que sirva como contexto cuando el usuario interactúe con esta persona en el futuro.",
    "",
    "Reglas:",
    "1. **narrative**: 3-5 frases. Densas, no genéricas. Captura quién es esta persona en el contexto del usuario, qué hilos están activos con ella, qué es lo no obvio. NO uses fluff (\"es una persona interesante\", \"buen profesional\"). Solo lo que ayudaría al usuario a entrar en una conversación con ella mañana.",
    "2. **resolved_facts**: hechos discretos que el usuario querría tener listos: idiomas, dieta, hobby principal, situación familiar, ubicación de residencia, restricciones temporales, conexiones clave (\"presentado por X\", \"socio de Y\"). NO repitas datos ya resueltos en columnas (role, company, location). Devuélvelo como JSON-en-string en el campo `raw`. Ejemplo: `{\"raw\":\"{\\\"idiomas\\\":[\\\"es\\\",\\\"en\\\",\\\"pt\\\"],\\\"vegetariano\\\":true}\"}`. Si no hay nada digno de fact, devuelve `{\"raw\":\"{}\"}`.",
    "3. **recurring_themes**: 3-7 temas que aparecen repetidamente en las observaciones. Frases cortas (1-3 palabras): \"fraude en banca\", \"familia en Vigo\", \"búsqueda de inversión\".",
    "4. **active_threads**: hilos abiertos. Cada uno tiene `title` (qué) y `status` (estado actual: 'pendiente', 'esperando-respuesta', 'en-progreso', 'agendado'). Solo cosas que requieren acción o seguimiento del usuario, no anécdotas pasadas.",
    "5. NO inventes información. Si no hay observaciones suficientes, narrative breve y arrays vacíos están bien.",
    "6. Si una observación reciente CONTRADICE una vieja (ej: cambió de empresa), refleja la nueva en narrative y resolved_facts. Las observaciones tienen `superseded_by` cuando ya están invalidadas — esas no aparecerán en tu input.",
  ].join("\n");
}

export function profileUserMessage(args: {
  fullName: string;
  basics: { role?: string; company?: string; location?: string; tags?: string[] };
  previousNarrative: string | null;
  observations: SynthesisObservationLine[];
}): string {
  const lines: string[] = [];
  lines.push(`# Persona: ${args.fullName}`);
  const b = args.basics;
  const basics: string[] = [];
  if (b.role) basics.push(`role=${b.role}`);
  if (b.company) basics.push(`company=${b.company}`);
  if (b.location) basics.push(`location=${b.location}`);
  if (b.tags && b.tags.length) basics.push(`tags=${b.tags.join(",")}`);
  if (basics.length) lines.push(basics.join(" | "));
  if (args.previousNarrative) {
    lines.push("");
    lines.push("## Narrative anterior");
    lines.push(args.previousNarrative);
  }
  lines.push("");
  lines.push("## Observaciones (más recientes primero)");
  for (const o of args.observations) {
    const facet = o.facetType ? `[${o.facetType}] ` : "";
    lines.push(`- ${o.observed_at} ${facet}${o.content}`);
  }
  if (args.observations.length === 0) {
    lines.push("(ninguna)");
  }
  return lines.join("\n");
}
