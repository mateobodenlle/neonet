import type { Person } from "../../lib/types";

export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  // Treat E.164 +34... as canonical. Strip leading zeros after +.
  return digits.startsWith("+") ? digits : digits.replace(/^0+/, "");
}

export function normalizeEmail(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents for fuzzy match
}

export interface DedupIndex {
  byEmail: Map<string, Person>;
  byPhone: Map<string, Person>;
  byNameCompany: Map<string, Person>; // key: "name|company"
}

export function buildIndex(people: Person[]): DedupIndex {
  const byEmail = new Map<string, Person>();
  const byPhone = new Map<string, Person>();
  const byNameCompany = new Map<string, Person>();
  for (const p of people) {
    const email = normalizeEmail(p.handles?.email);
    if (email) byEmail.set(email, p);
    const phone = normalizePhone(p.handles?.phone);
    if (phone) byPhone.set(phone, p);
    const name = normalizeName(p.fullName);
    const company = normalizeName(p.company);
    if (name) byNameCompany.set(`${name}|${company ?? ""}`, p);
  }
  return { byEmail, byPhone, byNameCompany };
}

export type MatchReason = "email" | "phone" | "name+company";

export interface Match {
  existing: Person;
  reason: MatchReason;
}

export function findMatch(candidate: Person, idx: DedupIndex): Match | null {
  const email = normalizeEmail(candidate.handles?.email);
  if (email) {
    const hit = idx.byEmail.get(email);
    if (hit) return { existing: hit, reason: "email" };
  }
  const phone = normalizePhone(candidate.handles?.phone);
  if (phone) {
    const hit = idx.byPhone.get(phone);
    if (hit) return { existing: hit, reason: "phone" };
  }
  const name = normalizeName(candidate.fullName);
  const company = normalizeName(candidate.company);
  if (name && company) {
    const hit = idx.byNameCompany.get(`${name}|${company}`);
    if (hit) return { existing: hit, reason: "name+company" };
  }
  return null;
}
