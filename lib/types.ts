export type Category =
  | "cliente-potencial"
  | "cliente"
  | "inversor"
  | "partner"
  | "talento"
  | "amigo"
  | "otro";

export type Temperature = "frio" | "tibio" | "caliente";

export type Sector =
  | "fintech"
  | "saas"
  | "ecommerce"
  | "industria"
  | "salud"
  | "energia"
  | "edtech"
  | "legaltech"
  | "retail"
  | "logistica"
  | "media"
  | "consultoria"
  | "otro";

export type Seniority = "junior" | "mid" | "senior" | "c-level" | "founder";

export type InteractionKind =
  | "encuentro"
  | "llamada"
  | "email"
  | "mensaje"
  | "reunion"
  | "nota";

export interface SocialHandles {
  linkedin?: string;
  instagram?: string;
  twitter?: string;
  email?: string;
  phone?: string;
  website?: string;
}

export interface PainPoint {
  id: string;
  personId: string;
  description: string;
  createdAt: string;
  sourceEncounterId?: string;
  sourceInteractionId?: string;
  resolved?: boolean;
}

export interface Promise {
  id: string;
  personId: string;
  description: string;
  direction: "yo-a-el" | "el-a-mi";
  dueDate?: string;
  done: boolean;
  createdAt: string;
  completedAt?: string;
}

export interface Event {
  id: string;
  name: string;
  location?: string;
  date: string;
  endDate?: string;
  notes?: string;
}

export interface Encounter {
  id: string;
  personId: string;
  eventId?: string;
  date: string;
  location?: string;
  context?: string;
  introducedById?: string;
}

export interface Interaction {
  id: string;
  personId: string;
  kind: InteractionKind;
  date: string;
  summary: string;
  body?: string;
  encounterId?: string;
}

export interface Edge {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  kind: "conoce" | "trabaja-con" | "familiar" | "presentado-por" | "inversor-de";
  note?: string;
}

export interface Person {
  id: string;
  fullName: string;
  aliases?: string[];
  photoUrl?: string;
  role?: string;
  company?: string;
  sector?: Sector;
  seniority?: Seniority;
  location?: string;
  handles?: SocialHandles;
  category: Category;
  temperature: Temperature;
  tags: string[];
  interests?: string[];
  affinity?: 1 | 2 | 3 | 4 | 5;
  trust?: 1 | 2 | 3 | 4 | 5;
  nextStep?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  people: Person[];
  events: Event[];
  encounters: Encounter[];
  interactions: Interaction[];
  painPoints: PainPoint[];
  promises: Promise[];
  edges: Edge[];
}
