/**
 * One-off enrichment: walks every person with a linkedin handle, looks them
 * up in a fresh LinkedIn Connections.csv, and fills in fields that are still
 * empty (role, company, email). Existing values are never overwritten.
 *
 * Usage:
 *   npx tsx scripts/one-shot/enrich-from-connections.ts <Connections.csv>
 *   npx tsx scripts/one-shot/enrich-from-connections.ts <Connections.csv> --commit
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

interface LinkedInRow {
  "First Name"?: string;
  "Last Name"?: string;
  URL?: string;
  "Email Address"?: string;
  Company?: string;
  Position?: string;
  "Connected On"?: string;
}

interface PersonRow {
  id: string;
  full_name: string;
  role: string | null;
  company: string | null;
  handles: Record<string, string> | null;
}

function stripPreamble(text: string): string {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^"?First Name"?\s*,/.test(l));
  return idx <= 0 ? text : lines.slice(idx).join("\n");
}

function extractHandle(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const parts = path.split("/");
    const inIdx = parts.indexOf("in");
    const raw = inIdx >= 0 && parts[inIdx + 1] ? parts[inIdx + 1] : parts[0];
    return raw ? decodeURIComponent(raw).toLowerCase() : null;
  } catch {
    return null;
  }
}

function normalizeStoredHandle(h: string | undefined | null): string | null {
  if (!h) return null;
  // Existing rows store handles in various shapes — try to coerce to the
  // same canonical form as extractHandle would emit.
  let s = h.trim();
  if (s.startsWith("http")) return extractHandle(s);
  return decodeURIComponent(s.replace(/\/+$/g, "")).toLowerCase();
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!file) {
    console.error("Usage: enrich-from-connections.ts <Connections.csv> [--commit]");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const csvRows: LinkedInRow[] = parse(stripPreamble(raw), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });

  // Index CSV by handle.
  const byHandle = new Map<string, LinkedInRow>();
  for (const r of csvRows) {
    const h = extractHandle(r.URL);
    if (h && !byHandle.has(h)) byHandle.set(h, r);
  }
  console.log(`CSV rows indexed by handle: ${byHandle.size}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await db
    .from("people")
    .select("id, full_name, role, company, handles");
  if (error) throw error;
  const people = (data ?? []) as PersonRow[];
  console.log(`People in DB: ${people.length}`);

  type Update = {
    id: string;
    full_name: string;
    matched_handle: string;
    fills: Partial<{ role: string; company: string; handles: Record<string, string> }>;
  };
  const updates: Update[] = [];
  let withLinkedin = 0;
  let noMatch = 0;
  let nothingToFill = 0;

  for (const p of people) {
    const stored = normalizeStoredHandle(p.handles?.linkedin);
    if (!stored) continue;
    withLinkedin++;
    const csv = byHandle.get(stored);
    if (!csv) {
      noMatch++;
      continue;
    }
    const fill: Update["fills"] = {};
    const csvRole = csv.Position?.trim();
    const csvCompany = csv.Company?.trim();
    const csvEmail = csv["Email Address"]?.trim();
    if (csvRole && !p.role) fill.role = csvRole;
    if (csvCompany && !p.company) fill.company = csvCompany;
    if (csvEmail && !(p.handles?.email)) {
      fill.handles = { ...(p.handles ?? {}), email: csvEmail };
    }
    if (Object.keys(fill).length === 0) {
      nothingToFill++;
      continue;
    }
    updates.push({
      id: p.id,
      full_name: p.full_name,
      matched_handle: stored,
      fills: fill,
    });
  }

  console.log(`\n  with linkedin handle  ${withLinkedin}`);
  console.log(`  no match in CSV       ${noMatch}`);
  console.log(`  nothing new to fill   ${nothingToFill}`);
  console.log(`  to enrich             ${updates.length}\n`);

  for (const u of updates) {
    const parts: string[] = [];
    if (u.fills.role) parts.push(`role="${u.fills.role}"`);
    if (u.fills.company) parts.push(`company="${u.fills.company}"`);
    if (u.fills.handles?.email) parts.push(`email="${u.fills.handles.email}"`);
    console.log(`  ${u.full_name.padEnd(35)}  ${parts.join("  ")}`);
  }

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to apply.");
    return;
  }
  if (updates.length === 0) return;

  console.log("\nApplying...");
  for (const u of updates) {
    const patch: Record<string, unknown> = {};
    if (u.fills.role) patch.role = u.fills.role;
    if (u.fills.company) patch.company = u.fills.company;
    if (u.fills.handles) patch.handles = u.fills.handles;
    const { error } = await db.from("people").update(patch).eq("id", u.id);
    if (error) {
      console.error(`  ✗ ${u.full_name}: ${error.message}`);
      continue;
    }
  }
  console.log(`✓ Updated ${updates.length} contacts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
