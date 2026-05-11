// Fixture realista para la demo: 12 contactos, eventos, encounters,
// observaciones y edges. Refleja un uso real (founder en Galicia con red de
// contactos en banca, retail, hostelería y comunidad founder).

import type {
  Edge,
  Encounter,
  Event,
  Observation,
  ObservationParticipant,
  Person,
} from "@/lib/types";

const NOW_ISO = "2026-05-11T08:00:00Z";

// ---------- helpers ----------

function p(
  id: string,
  fullName: string,
  rest: Partial<Person>,
): Person {
  return {
    id,
    fullName,
    aliases: rest.aliases,
    role: rest.role,
    company: rest.company,
    sector: rest.sector,
    seniority: rest.seniority,
    location: rest.location,
    handles: rest.handles,
    category: rest.category ?? "otro",
    temperature: rest.temperature ?? "tibio",
    closeness: rest.closeness,
    tags: rest.tags ?? [],
    interests: rest.interests,
    affinity: rest.affinity,
    trust: rest.trust,
    nextStep: rest.nextStep,
    autoCreated: false,
    priorScore: rest.priorScore ?? 0,
    lastObservationAt: rest.lastObservationAt,
    observationCount90d: rest.observationCount90d,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  };
}

function obs(
  id: string,
  primary: string,
  content: string,
  observedAt: string,
  facets: Record<string, unknown>,
  opts: { tags?: string[]; extras?: Array<{ pid: string; role: ObservationParticipant["role"] }> } = {},
): { observation: Observation; participants: ObservationParticipant[] } {
  const observation: Observation = {
    id,
    primaryPersonId: primary,
    content,
    observedAt,
    source: "demo-seed",
    tags: opts.tags ?? [],
    facets,
    createdAt: NOW_ISO,
  };
  const participants: ObservationParticipant[] = [
    { observationId: id, personId: primary, role: "primary" },
  ];
  for (const e of opts.extras ?? []) {
    participants.push({ observationId: id, personId: e.pid, role: e.role });
  }
  return { observation, participants };
}

// ---------- personas ----------

const PEOPLE: Person[] = [
  p("demo-p-jaime", "Jaime López-Moreno", {
    aliases: ["Jaime"],
    role: "CTO",
    company: "Flexo Retail",
    sector: "retail",
    seniority: "c-level",
    location: "Madrid",
    handles: { linkedin: "jaimelopezmoreno", email: "jaime@flexo.es" },
    category: "cliente-potencial",
    temperature: "caliente",
    closeness: "conocido",
    tags: ["retail", "decision-maker", "vision"],
    interests: ["computer vision", "gestión de stock"],
    affinity: 4,
    trust: 4,
    nextStep: "Enviar deck del POC el lunes 13/04",
    priorScore: 8.4,
    lastObservationAt: "2026-04-08",
    observationCount90d: 3,
  }),
  p("demo-p-marta", "Marta Iglesias", {
    aliases: ["Marta"],
    role: "Senior PM",
    company: "BBVA Innovation",
    sector: "fintech",
    seniority: "senior",
    location: "Madrid",
    handles: { linkedin: "martaiglesiasf", email: "marta.iglesias@bbva.com" },
    category: "amigo",
    temperature: "caliente",
    closeness: "amigo",
    tags: ["banca", "producto", "ex-uni"],
    affinity: 5,
    trust: 5,
    priorScore: 7.2,
    lastObservationAt: "2026-04-26",
    observationCount90d: 4,
  }),
  p("demo-p-pablo", "Pablo Ferreiro", {
    aliases: ["Pablo"],
    role: "General Partner",
    company: "Galicia Ventures",
    sector: "otro",
    seniority: "c-level",
    location: "Santiago",
    handles: { linkedin: "pabloferreiro", email: "pablo@galiciavc.com" },
    category: "inversor",
    temperature: "caliente",
    closeness: "conocido",
    tags: ["inversor", "seed", "galicia"],
    affinity: 3,
    trust: 4,
    nextStep: "Mandar deck actualizado",
    priorScore: 6.8,
    lastObservationAt: "2026-05-02",
    observationCount90d: 5,
  }),
  p("demo-p-lucia", "Lucía Vázquez", {
    aliases: ["Lucía"],
    role: "Co-founder & CEO",
    company: "Tariña.io",
    sector: "saas",
    seniority: "founder",
    location: "Vigo",
    handles: { linkedin: "luciavazquez", email: "lucia@tarina.io" },
    category: "amigo",
    temperature: "tibio",
    closeness: "amigo-cercano",
    tags: ["founder", "saas", "hostelería"],
    interests: ["product-led growth", "B2B SaaS"],
    affinity: 5,
    trust: 5,
    priorScore: 6.1,
    lastObservationAt: "2026-03-28",
    observationCount90d: 2,
  }),
  p("demo-p-andres", "Andrés Rodríguez", {
    role: "Senior Backend Engineer",
    company: "Glovo",
    sector: "logistica",
    seniority: "senior",
    location: "Barcelona",
    handles: { linkedin: "andresrodriguezbe" },
    category: "talento",
    temperature: "tibio",
    closeness: "conocido",
    tags: ["talento", "backend", "go"],
    interests: ["sistemas distribuidos"],
    affinity: 3,
    trust: 3,
    priorScore: 4.2,
    lastObservationAt: "2026-02-15",
    observationCount90d: 1,
  }),
  p("demo-p-elena", "Elena Sotelo", {
    role: "Head of People",
    company: "Indi",
    sector: "saas",
    seniority: "senior",
    location: "Madrid",
    handles: { linkedin: "elenasotelo" },
    category: "partner",
    temperature: "frio",
    closeness: "conocido",
    tags: ["rrhh", "scaleup"],
    priorScore: 3.5,
  }),
  p("demo-p-carlos", "Carlos Méndez", {
    aliases: ["Carlitos"],
    role: "CEO",
    company: "Frigoríficos del Norte",
    sector: "industria",
    seniority: "c-level",
    location: "A Coruña",
    handles: { linkedin: "carlosmendezfn", email: "carlos@frigorificosnorte.es" },
    category: "cliente-potencial",
    temperature: "caliente",
    closeness: "conocido",
    tags: ["cliente", "industrial", "vision"],
    affinity: 3,
    trust: 3,
    nextStep: "Visitar planta antes de fin de mes",
    priorScore: 5.4,
    lastObservationAt: "2026-04-22",
    observationCount90d: 3,
  }),
  p("demo-p-sofia", "Sofía García", {
    aliases: ["Sofi"],
    role: "Co-founder & CEO",
    company: "Nimbo",
    sector: "saas",
    seniority: "founder",
    location: "Madrid",
    handles: { linkedin: "sofiagarciafounder" },
    category: "amigo",
    temperature: "tibio",
    closeness: "amigo",
    tags: ["founder", "ai", "comunidad"],
    interests: ["LLM apps", "fundraising"],
    affinity: 4,
    trust: 4,
    priorScore: 5.8,
    lastObservationAt: "2026-04-01",
    observationCount90d: 2,
  }),
  p("demo-p-david", "David Pereira", {
    role: "Director de Operaciones",
    company: "Flexo Retail",
    sector: "retail",
    seniority: "senior",
    location: "Madrid",
    handles: { linkedin: "davidpereira-ops" },
    category: "cliente-potencial",
    temperature: "tibio",
    closeness: "conocido",
    tags: ["retail", "ops"],
    priorScore: 3.1,
    lastObservationAt: "2026-04-08",
  }),
  p("demo-p-ines", "Inés Carballo", {
    aliases: ["Inés"],
    role: "Partner",
    company: "Ríos Abogados",
    sector: "legaltech",
    seniority: "c-level",
    location: "Santiago",
    handles: { linkedin: "inescarballo" },
    category: "partner",
    temperature: "tibio",
    closeness: "amigable",
    tags: ["legal", "cap-table"],
    affinity: 4,
    trust: 5,
    priorScore: 4.0,
    lastObservationAt: "2026-04-18",
    observationCount90d: 2,
  }),
  p("demo-p-roi", "Roi Castro", {
    role: "Product Designer",
    company: "Freelance",
    sector: "otro",
    seniority: "senior",
    location: "Santiago",
    handles: { linkedin: "roicastro" },
    category: "amigo",
    temperature: "tibio",
    closeness: "amigo",
    tags: ["diseño", "marca"],
    affinity: 5,
    trust: 5,
    priorScore: 3.8,
  }),
  p("demo-p-emma", "Emma Otero", {
    role: "Investment Manager",
    company: "Kibo Ventures",
    sector: "otro",
    seniority: "mid",
    location: "Madrid",
    handles: { linkedin: "emmaotero-kibo" },
    category: "inversor",
    temperature: "caliente",
    closeness: "conocido",
    tags: ["inversor", "vc", "ai"],
    affinity: 3,
    trust: 3,
    nextStep: "Devolverle el deck con métricas Q1",
    priorScore: 6.4,
    lastObservationAt: "2026-04-30",
    observationCount90d: 4,
  }),
];

// ---------- eventos ----------

const EVENTS: Event[] = [
  {
    id: "demo-e-southsummit",
    name: "South Summit 2026",
    date: "2026-03-19",
    endDate: "2026-03-21",
    location: "Madrid · La N@ve",
    notes: "Track founder + retail.",
  },
  {
    id: "demo-e-bbva",
    name: "BBVA Innovation Day",
    date: "2026-04-09",
    location: "Madrid · Ciudad BBVA",
  },
  {
    id: "demo-e-galicianbeers",
    name: "Galician Founder Beers",
    date: "2026-04-25",
    location: "Santiago · A Reixa",
  },
  {
    id: "demo-e-kibo",
    name: "Kibo AI Founders Dinner",
    date: "2026-04-30",
    location: "Madrid · Café Comercial",
  },
  {
    id: "demo-e-retailtech",
    name: "RetailTech Iberia",
    date: "2026-05-21",
    endDate: "2026-05-22",
    location: "Barcelona · Fira",
  },
];

// ---------- encuentros ----------

const ENCOUNTERS: Encounter[] = [
  {
    id: "demo-en-1",
    personId: "demo-p-marta",
    eventId: "demo-e-southsummit",
    date: "2026-03-20",
    location: "Madrid",
    context: "Charla en track de fintech",
  },
  {
    id: "demo-en-2",
    personId: "demo-p-jaime",
    eventId: "demo-e-southsummit",
    date: "2026-03-20",
    location: "Madrid",
    context: "Presentado por Marta",
    introducedById: "demo-p-marta",
  },
  {
    id: "demo-en-3",
    personId: "demo-p-david",
    eventId: "demo-e-southsummit",
    date: "2026-03-21",
    location: "Madrid",
    context: "Mano derecha de Jaime",
  },
  {
    id: "demo-en-4",
    personId: "demo-p-sofia",
    eventId: "demo-e-southsummit",
    date: "2026-03-21",
    location: "Madrid",
  },
  {
    id: "demo-en-5",
    personId: "demo-p-jaime",
    eventId: "demo-e-bbva",
    date: "2026-04-09",
    location: "Madrid",
    context: "Café tras la keynote",
  },
  {
    id: "demo-en-6",
    personId: "demo-p-marta",
    eventId: "demo-e-bbva",
    date: "2026-04-09",
    location: "Madrid",
  },
  {
    id: "demo-en-7",
    personId: "demo-p-pablo",
    eventId: "demo-e-galicianbeers",
    date: "2026-04-25",
    location: "Santiago",
    context: "Habló del fondo nuevo de Galicia Ventures",
  },
  {
    id: "demo-en-8",
    personId: "demo-p-ines",
    eventId: "demo-e-galicianbeers",
    date: "2026-04-25",
    location: "Santiago",
  },
  {
    id: "demo-en-9",
    personId: "demo-p-roi",
    eventId: "demo-e-galicianbeers",
    date: "2026-04-25",
    location: "Santiago",
  },
  {
    id: "demo-en-10",
    personId: "demo-p-emma",
    eventId: "demo-e-kibo",
    date: "2026-04-30",
    location: "Madrid",
    context: "Cena de founders del portfolio",
  },
  {
    id: "demo-en-11",
    personId: "demo-p-sofia",
    eventId: "demo-e-kibo",
    date: "2026-04-30",
    location: "Madrid",
  },
  {
    id: "demo-en-12",
    personId: "demo-p-carlos",
    date: "2026-04-22",
    location: "A Coruña",
    context: "Visita inicial a la planta",
  },
];

// ---------- observaciones ----------

const OBS_BUILDERS = [
  () =>
    obs(
      "demo-o-1",
      "demo-p-jaime",
      "Jaime confirma interés en POC de visión artificial para detección de stock en tiendas Flexo.",
      "2026-04-08",
      { type: "pain_point" },
      { tags: ["vision", "retail"] },
    ),
  () =>
    obs(
      "demo-o-2",
      "demo-p-jaime",
      "Le prometí mandar el deck del POC el lunes 13/04.",
      "2026-04-08",
      { type: "promesa", direction: "yo-a-el", due_date: "2026-04-13" },
      { tags: ["promesa"] },
    ),
  () =>
    obs(
      "demo-o-3",
      "demo-p-marta",
      "Marta me presentó a Jaime en South Summit; le habían recomendado nuestra demo.",
      "2026-03-20",
      { type: "relacion", kind: "presentado-por" },
      { extras: [{ pid: "demo-p-jaime", role: "related" }] },
    ),
  () =>
    obs(
      "demo-o-4",
      "demo-p-pablo",
      "Pablo pidió el deck de la ronda seed; quiere meterlo en el comité del fondo.",
      "2026-05-02",
      { type: "promesa", direction: "yo-a-el", due_date: "2026-05-10" },
      { tags: ["fundraising"] },
    ),
  () =>
    obs(
      "demo-o-5",
      "demo-p-lucia",
      "Lucía piensa levantar pre-seed este verano, pero quiere primero validar dos canales B2B.",
      "2026-03-28",
      { type: "profesional", topic: "fundraising" },
    ),
  () =>
    obs(
      "demo-o-6",
      "demo-p-carlos",
      "Carlos comenta que pierden unidades por errores manuales en línea de empaquetado.",
      "2026-04-22",
      { type: "pain_point" },
      { tags: ["industrial"] },
    ),
  () =>
    obs(
      "demo-o-7",
      "demo-p-sofia",
      "Sofía está cerrando ronda A con Kibo Ventures, lead confirmado.",
      "2026-04-01",
      { type: "profesional", topic: "fundraising" },
    ),
  () =>
    obs(
      "demo-o-8",
      "demo-p-emma",
      "Emma quiere ver métricas Q1 antes de pasar a comité; cita en 3 semanas.",
      "2026-04-30",
      { type: "promesa", direction: "yo-a-el", due_date: "2026-05-21" },
      { tags: ["fundraising", "vc"] },
    ),
  () =>
    obs(
      "demo-o-9",
      "demo-p-marta",
      "Marta acaba de cerrar la familia: bebé previsto en septiembre.",
      "2026-04-26",
      { type: "personal", topic: "familia" },
    ),
  () =>
    obs(
      "demo-o-10",
      "demo-p-jaime",
      "Jaime me presentó a David Pereira (ops); David sería el sponsor interno del POC.",
      "2026-04-09",
      { type: "relacion", kind: "presentado-por" },
      { extras: [{ pid: "demo-p-david", role: "related" }] },
    ),
  () =>
    obs(
      "demo-o-11",
      "demo-p-david",
      "David quiere ver un piloto en 2 tiendas antes de cualquier compromiso.",
      "2026-04-09",
      { type: "pain_point" },
    ),
  () =>
    obs(
      "demo-o-12",
      "demo-p-ines",
      "Inés revisa el pacto de socios este viernes; mañana le mando borrador.",
      "2026-04-18",
      { type: "promesa", direction: "yo-a-el", due_date: "2026-04-19" },
      { tags: ["legal"] },
    ),
  () =>
    obs(
      "demo-o-13",
      "demo-p-andres",
      "Andrés abierto a moverse de Glovo; quiere algo con más impacto pero no quiere bajar salario.",
      "2026-02-15",
      { type: "profesional", topic: "cambio-trabajo" },
      { tags: ["talento"] },
    ),
  () =>
    obs(
      "demo-o-14",
      "demo-p-roi",
      "Roi se ofreció a echar una mano con la identidad visual gratis si le dejo un poco de equity.",
      "2026-04-25",
      { type: "promesa", direction: "el-a-mi" },
      { tags: ["diseño"] },
    ),
  () =>
    obs(
      "demo-o-15",
      "demo-p-pablo",
      "Pablo conocido cercano de Inés Carballo (ambos de Santiago).",
      "2026-04-25",
      { type: "relacion", kind: "trabaja-con" },
      { extras: [{ pid: "demo-p-ines", role: "related" }] },
    ),
  () =>
    obs(
      "demo-o-16",
      "demo-p-lucia",
      "Lucía me pasa lead de restaurante en Vigo interesado en módulo IA para reservas.",
      "2026-03-15",
      { type: "relacion", kind: "presentado-por" },
    ),
  () =>
    obs(
      "demo-o-17",
      "demo-p-carlos",
      "Carlos firma NDA bilateral; siguiente paso visita técnica a planta.",
      "2026-04-22",
      { type: "evento", event_name: "NDA Frigoríficos del Norte" },
      { tags: ["legal", "industrial"] },
    ),
  () =>
    obs(
      "demo-o-18",
      "demo-p-sofia",
      "Sofía recomienda priorizar Whisper sobre Deepgram para ES; ellos lo han probado a fondo.",
      "2026-03-22",
      { type: "interes", topic: "transcripción" },
    ),
  () =>
    obs(
      "demo-o-19",
      "demo-p-jaime",
      "Jaime me pide que el POC funcione con sus cámaras existentes (Axis), no quiere hardware nuevo.",
      "2026-04-08",
      { type: "pain_point" },
      { tags: ["vision", "constraint"] },
    ),
  () =>
    obs(
      "demo-o-20",
      "demo-p-emma",
      "Emma comparte que Kibo lidera la A de Nimbo; conoce muy bien a Sofía.",
      "2026-04-30",
      { type: "relacion", kind: "trabaja-con" },
      { extras: [{ pid: "demo-p-sofia", role: "related" }] },
    ),
];

// ---------- edges ----------

const EDGES: Edge[] = [
  { id: "demo-ed-1", fromPersonId: "demo-p-marta", toPersonId: "demo-p-jaime", kind: "presentado-por", note: "South Summit" },
  { id: "demo-ed-2", fromPersonId: "demo-p-jaime", toPersonId: "demo-p-david", kind: "trabaja-con", note: "CTO + Ops" },
  { id: "demo-ed-3", fromPersonId: "demo-p-pablo", toPersonId: "demo-p-ines", kind: "conoce", note: "Santiago" },
  { id: "demo-ed-4", fromPersonId: "demo-p-emma", toPersonId: "demo-p-sofia", kind: "inversor-de", note: "Kibo lidera A de Nimbo" },
  { id: "demo-ed-5", fromPersonId: "demo-p-lucia", toPersonId: "demo-p-roi", kind: "conoce" },
  { id: "demo-ed-6", fromPersonId: "demo-p-marta", toPersonId: "demo-p-sofia", kind: "conoce", note: "Ex-uni" },
  { id: "demo-ed-7", fromPersonId: "demo-p-pablo", toPersonId: "demo-p-lucia", kind: "conoce", note: "Galicia founders" },
  { id: "demo-ed-8", fromPersonId: "demo-p-jaime", toPersonId: "demo-p-marta", kind: "trabaja-con", note: "BBVA Innovation Day" },
  { id: "demo-ed-9", fromPersonId: "demo-p-emma", toPersonId: "demo-p-pablo", kind: "conoce", note: "Comunidad VC" },
];

// ---------- narrativas (person_profiles.narrative) ----------

const NARRATIVES: Record<string, string> = {
  "demo-p-jaime":
    "CTO de Flexo Retail, fuerte interés en visión artificial para detección de stock. Conocido en South Summit por Marta. Pide POC con cámaras Axis existentes, sponsor interno: David Pereira (ops). Próximo paso: deck del POC entregado.",
  "demo-p-marta":
    "PM senior en BBVA Innovation, amiga cercana de la universidad. Nodo de conexión clave — me ha presentado a Jaime (Flexo) y conoce a Sofía. Bebé previsto en septiembre.",
  "demo-p-pablo":
    "GP en Galicia Ventures. Pidió deck para comité del fondo; conexión cercana con Inés Carballo. Concentra red en la comunidad founder de Galicia.",
  "demo-p-lucia":
    "Co-founder de Tariña.io (SaaS hostelería), amiga cercana. Planea pre-seed en verano. Suele pasarme leads del sector restauración.",
  "demo-p-carlos":
    "CEO de Frigoríficos del Norte. Cliente potencial industrial — necesita reducir errores en línea de empaquetado. NDA firmado, visita técnica pendiente.",
  "demo-p-sofia":
    "Founder de Nimbo. Cerrando ronda A con Kibo (Emma Otero lidera). Buena referencia técnica para transcripción.",
  "demo-p-emma":
    "Investment Manager en Kibo. Quiere métricas Q1 antes de pasar a comité. Lidera la A de Nimbo — vía Sofía.",
  "demo-p-ines":
    "Partner en Ríos Abogados, asesoría legal del cap table. Conexión cercana con Pablo Ferreiro.",
  "demo-p-roi":
    "Diseñador de producto freelance, amigo. Disponible para echar mano con identidad visual a cambio de equity ligero.",
  "demo-p-david":
    "Director de Operaciones en Flexo Retail. Sponsor interno del POC; quiere piloto en 2 tiendas antes de comprometerse.",
  "demo-p-andres":
    "Backend senior en Glovo, perfil de talento. Abierto a moverse pero sin bajar salario.",
};

// ---------- extracciones pendientes pre-cargadas ----------

import type { ExtractionV2 } from "@/lib/nl-types";

const SAMPLE_EXTRACTION: ExtractionV2 = {
  observations: [
    {
      content: "Marta me cuenta que en BBVA están evaluando launchpad de IA para startups Q3.",
      observed_at: "2026-05-08",
      primary_mention: {
        text: "Marta",
        candidate_ids: ["demo-p-marta"],
        proposed_new: null,
        confidence: "high",
      },
      participants: [],
      tags: ["banca", "oportunidad"],
      facets: { raw: JSON.stringify({ type: "profesional", topic: "oportunidad" }) },
      supersedes_hint: null,
    },
    {
      content: "Marta me sugiere hablar con Pedro Iglesias, su jefe, antes de mandar nada formal.",
      observed_at: "2026-05-08",
      primary_mention: {
        text: "Pedro Iglesias",
        candidate_ids: [],
        proposed_new: {
          full_name: "Pedro Iglesias",
          role: "Head of Innovation",
          company: "BBVA Innovation",
          notes: "Jefe directo de Marta",
        },
        confidence: "medium",
      },
      participants: [{ mention: { text: "Marta", candidate_ids: ["demo-p-marta"], proposed_new: null, confidence: "high" }, role: "source" }],
      tags: ["banca"],
      facets: { raw: "{}" },
      supersedes_hint: null,
    },
  ],
  events: [],
  person_updates: [],
  warnings: [],
  summary: "Oportunidad en BBVA + contacto nuevo (Pedro Iglesias) sugerido por Marta.",
};

// ---------- build ----------

export function buildSeed() {
  const people = new Map<string, Person>();
  for (const person of PEOPLE) people.set(person.id, person);

  const events = new Map<string, Event>();
  for (const e of EVENTS) events.set(e.id, e);

  const encounters = new Map<string, Encounter>();
  for (const e of ENCOUNTERS) encounters.set(e.id, e);

  const observations = new Map<string, Observation>();
  const participants: ObservationParticipant[] = [];
  for (const build of OBS_BUILDERS) {
    const { observation, participants: parts } = build();
    observations.set(observation.id, observation);
    for (const p of parts) participants.push(p);
  }

  const edges = new Map<string, Edge>();
  for (const ed of EDGES) edges.set(ed.id, ed);

  const narratives = new Map<string, string>();
  for (const [pid, n] of Object.entries(NARRATIVES)) narratives.set(pid, n);

  return { people, events, encounters, observations, participants, edges, narratives };
}

export function sampleExtraction(): ExtractionV2 {
  return JSON.parse(JSON.stringify(SAMPLE_EXTRACTION)) as ExtractionV2;
}
