import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import type { Person } from "../../lib/types";
import { personFromRow, personToRow } from "../../lib/mappers";
import { buildIndex, findMatch, type Match } from "./dedup";

export interface ImportResult {
  total: number;
  newRows: Person[];
  matched: Array<{ candidate: Person; match: Match }>;
  invalid: Array<{ index: number; reason: string }>;
}

export function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function fetchExistingPeople(): Promise<Person[]> {
  const db = makeAdminClient();
  const { data, error } = await db.from("people").select("*");
  if (error) throw error;
  return (data ?? []).map(personFromRow);
}

export function classify(candidates: Person[], existing: Person[]): ImportResult {
  const idx = buildIndex(existing);
  const newRows: Person[] = [];
  const matched: Array<{ candidate: Person; match: Match }> = [];
  // Also dedup within the candidate batch itself (same person twice in vCard).
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  for (const c of candidates) {
    const m = findMatch(c, idx);
    if (m) {
      matched.push({ candidate: c, match: m });
      continue;
    }
    // Self-dedup within this batch.
    const e = c.handles?.email?.toLowerCase().trim();
    const p = c.handles?.phone?.replace(/[^\d+]/g, "");
    if ((e && seenEmails.has(e)) || (p && seenPhones.has(p))) {
      matched.push({
        candidate: c,
        match: { existing: c, reason: "email" }, // self-collision flagged as match
      });
      continue;
    }
    if (e) seenEmails.add(e);
    if (p) seenPhones.add(p);
    newRows.push(c);
  }
  return { total: candidates.length, newRows, matched, invalid: [] };
}

export function printReport(label: string, result: ImportResult) {
  console.log(`\n=== ${label} ===`);
  console.log(`  total parsed     ${result.total}`);
  console.log(`  new              ${result.newRows.length}`);
  console.log(`  matched (skip)   ${result.matched.length}`);
  if (result.invalid.length) console.log(`  invalid          ${result.invalid.length}`);

  if (result.matched.length > 0 && result.matched.length <= 30) {
    console.log("\n  matches:");
    for (const m of result.matched) {
      console.log(
        `    · ${m.candidate.fullName} ↔ ${m.match.existing.fullName} (by ${m.match.reason})`
      );
    }
  } else if (result.matched.length > 30) {
    console.log(`  (${result.matched.length} matches — too many to list)`);
  }

  if (result.invalid.length > 0 && result.invalid.length <= 30) {
    console.log("\n  invalid:");
    for (const i of result.invalid) console.log(`    · row ${i.index}: ${i.reason}`);
  }
}

export async function commit(rows: Person[]) {
  if (rows.length === 0) return;
  const db = makeAdminClient();
  const dbRows = rows.map(personToRow);
  // Insert in batches of 200 to stay below request limits.
  const BATCH = 200;
  for (let i = 0; i < dbRows.length; i += BATCH) {
    const slice = dbRows.slice(i, i + BATCH);
    const { error } = await db.from("people").insert(slice);
    if (error) throw error;
    console.log(`  inserted ${Math.min(i + BATCH, dbRows.length)} / ${dbRows.length}`);
  }
}
