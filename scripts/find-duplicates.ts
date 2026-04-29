/**
 * Scans the people table for duplicate candidates and prints them grouped by
 * confidence. Read-only — no writes. Used during the manual cleanup pass
 * after the first round of imports.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

interface Person {
  id: string;
  full_name: string;
  company: string | null;
  role: string | null;
  handles: Record<string, string> | null;
  tags: string[];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "");
}

// Levenshtein with early-out on threshold.
function lev(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1).fill(0).map((_, i) => i);
  const curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// Token-set ratio: are the word sets close after sorting? Catches reordered
// names ("Mateo Bodenlle Villarino" vs "Mateo Villarino Bodenlle").
function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}

function firstName(s: string): string {
  return normalize(s).split(" ")[0] ?? "";
}

interface Pair {
  a: Person;
  b: Person;
  reason: string;
}

async function main() {
  const { data, error } = await db.from("people").select("id, full_name, company, role, handles, tags");
  if (error) throw error;
  const people = (data ?? []) as Person[];

  console.log(`Loaded ${people.length} people.\n`);

  // --- bucket 1: identical email / phone / linkedin ---
  const byEmail = new Map<string, Person[]>();
  const byPhone = new Map<string, Person[]>();
  const byLinkedin = new Map<string, Person[]>();
  for (const p of people) {
    const email = normalize(p.handles?.email ?? "");
    if (email) (byEmail.get(email) ?? byEmail.set(email, []).get(email)!).push(p);
    const phoneRaw = (p.handles?.phone ?? "").replace(/[^\d+]/g, "");
    if (phoneRaw) (byPhone.get(phoneRaw) ?? byPhone.set(phoneRaw, []).get(phoneRaw)!).push(p);
    const li = normalize(p.handles?.linkedin ?? "");
    if (li) (byLinkedin.get(li) ?? byLinkedin.set(li, []).get(li)!).push(p);
  }

  const dropped = new Set<string>();
  const obvious: Pair[] = [];

  function emitGroup(group: Person[], reason: string) {
    if (group.length < 2) return;
    const sorted = [...group].sort((x, y) => x.id.localeCompare(y.id));
    for (let i = 1; i < sorted.length; i++) {
      obvious.push({ a: sorted[0], b: sorted[i], reason });
      dropped.add(sorted[i].id);
    }
    dropped.add(sorted[0].id);
  }
  for (const g of byEmail.values()) emitGroup(g, "same email");
  for (const g of byPhone.values()) emitGroup(g, "same phone");
  for (const g of byLinkedin.values()) emitGroup(g, "same linkedin");

  // --- bucket 2: identical normalized name ---
  const byName = new Map<string, Person[]>();
  for (const p of people) {
    if (dropped.has(p.id)) continue;
    const n = normalize(p.full_name);
    if (!n) continue;
    (byName.get(n) ?? byName.set(n, []).get(n)!).push(p);
  }
  const exactNameDup: Pair[] = [];
  for (const [, g] of byName) {
    if (g.length >= 2) {
      for (let i = 1; i < g.length; i++) exactNameDup.push({ a: g[0], b: g[i], reason: "same name" });
      g.forEach((p) => dropped.add(p.id));
    }
  }

  // --- bucket 3: cross-source likely matches (phone contact ↔ linkedin invitation) ---
  // Phone contacts have tag "from-phone"; invitation contacts have "from-linkedin-invitations".
  // Match if normalized first+last names overlap strongly OR fuzzy distance ≤ 2.
  const phonePeople = people.filter((p) => p.tags?.includes("from-phone") && !dropped.has(p.id));
  const linkedinPeople = people.filter(
    (p) => p.tags?.includes("from-linkedin-invitations") && !dropped.has(p.id)
  );
  console.log(`Cross-source pool: ${phonePeople.length} phone × ${linkedinPeople.length} linkedin\n`);

  const likely: Pair[] = [];
  const maybe: Pair[] = [];
  for (const ph of phonePeople) {
    const phNorm = normalize(ph.full_name);
    const phTokens = tokenSet(ph.full_name);
    const phFirst = firstName(ph.full_name);
    if (!phNorm) continue;
    for (const li of linkedinPeople) {
      const liNorm = normalize(li.full_name);
      const liTokens = tokenSet(li.full_name);
      if (!liNorm) continue;
      // Cheap pre-filter: must share first name or be within a few chars.
      if (phFirst !== firstName(li.full_name) && Math.abs(phNorm.length - liNorm.length) > 4)
        continue;

      const j = jaccard(phTokens, liTokens);
      const d = lev(phNorm, liNorm, 3);

      if (j >= 0.66 && d <= 1) likely.push({ a: ph, b: li, reason: `tokens=${j.toFixed(2)} lev=${d}` });
      else if (j >= 0.5 || d <= 2) maybe.push({ a: ph, b: li, reason: `tokens=${j.toFixed(2)} lev=${d}` });
    }
  }

  // --- bucket 4: within-source fuzzy duplicates (e.g. "Antonio Lopez" vs "Antonio López") ---
  const remaining = people.filter((p) => !dropped.has(p.id));
  const fuzzyWithin: Pair[] = [];
  // Bucket by first letter of first name to keep it O(n²/26).
  const byFirstLetter = new Map<string, Person[]>();
  for (const p of remaining) {
    const f = firstName(p.full_name)[0];
    if (!f) continue;
    (byFirstLetter.get(f) ?? byFirstLetter.set(f, []).get(f)!).push(p);
  }
  for (const group of byFirstLetter.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const aN = normalize(a.full_name);
        const bN = normalize(b.full_name);
        if (!aN || !bN) continue;
        if (firstName(a.full_name) !== firstName(b.full_name)) continue;
        const d = lev(aN, bN, 2);
        if (d > 0 && d <= 2) {
          const aT = tokenSet(a.full_name);
          const bT = tokenSet(b.full_name);
          if (jaccard(aT, bT) >= 0.5) fuzzyWithin.push({ a, b, reason: `lev=${d}` });
        }
      }
    }
  }

  // --- print report ---
  function fmt(p: Person): string {
    const parts: string[] = [p.full_name];
    if (p.company) parts.push(`@ ${p.company}`);
    if (p.role) parts.push(`(${p.role})`);
    const handles: string[] = [];
    if (p.handles?.email) handles.push(`email:${p.handles.email}`);
    if (p.handles?.phone) handles.push(`tel:${p.handles.phone}`);
    if (p.handles?.linkedin) handles.push(`li:${p.handles.linkedin}`);
    if (handles.length) parts.push(`[${handles.join(", ")}]`);
    parts.push(`{${p.tags?.join(",") ?? ""}}`);
    parts.push(`#${p.id.slice(0, 8)}`);
    return parts.join(" ");
  }

  function printPairs(label: string, pairs: Pair[]) {
    console.log(`\n=== ${label} (${pairs.length}) ===`);
    if (pairs.length === 0) {
      console.log("  none");
      return;
    }
    pairs.forEach((p, i) => {
      console.log(`\n  [${i + 1}] ${p.reason}`);
      console.log(`      A: ${fmt(p.a)}`);
      console.log(`      B: ${fmt(p.b)}`);
    });
  }

  printPairs("OBVIOUS — same identifier (email/phone/linkedin)", obvious);
  printPairs("OBVIOUS — same normalized name", exactNameDup);
  printPairs("LIKELY — cross-source name match (phone ↔ linkedin)", likely);
  printPairs("MAYBE — cross-source weaker match (phone ↔ linkedin)", maybe);
  printPairs("FUZZY — same source, near-identical name", fuzzyWithin);

  console.log("\n=== summary ===");
  console.log(`  obvious (identifier):  ${obvious.length}`);
  console.log(`  obvious (name):        ${exactNameDup.length}`);
  console.log(`  likely (cross-source): ${likely.length}`);
  console.log(`  maybe (cross-source):  ${maybe.length}`);
  console.log(`  fuzzy (same source):   ${fuzzyWithin.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
