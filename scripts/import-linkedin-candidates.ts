/**
 * Imports LinkedIn Connections.csv into the connection_candidates staging
 * table. Rows that already match an existing Person (by linkedin handle or
 * email) are skipped — only candidates that need a manual decision land
 * here. Re-imports are safe: the unique (source, linkedin_url) constraint
 * preserves prior accept/reject/merge decisions.
 *
 * Usage:
 *   npm run import:linkedin-candidates -- <path-to-Connections.csv>
 *   npm run import:linkedin-candidates -- <path-to-Connections.csv> --commit
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { fetchExistingPeople } from "./lib/import-runner";
import { buildIndex, normalizeEmail, normalizeLinkedin } from "./lib/dedup";
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

function stripPreamble(text: string): string {
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^"?First Name"?\s*,/.test(l));
  if (headerIdx <= 0) return text;
  return lines.slice(headerIdx).join("\n");
}

function extractLinkedinHandle(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const parts = path.split("/");
    const inIdx = parts.indexOf("in");
    const raw = inIdx >= 0 && parts[inIdx + 1] ? parts[inIdx + 1] : parts[0];
    if (!raw) return undefined;
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return undefined;
  }
}

function normalizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/g, "");
    return `${u.origin}${decodeURIComponent(path)}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase() || undefined;
  }
}

// LinkedIn export uses "DD MMM YYYY". Convert to ISO date or null.
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
function parseConnectedOn(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const [, dd, mon, yyyy] = m;
  const mm = MONTHS[mon.toLowerCase()];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!file) {
    console.error("Usage: npm run import:linkedin-candidates -- <Connections.csv> [--commit]");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const cleaned = stripPreamble(raw);
  const rows: LinkedInRow[] = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    bom: true,
  });
  console.log(`Parsed ${rows.length} rows from ${file}.`);

  const existing = await fetchExistingPeople();
  const idx = buildIndex(existing);
  console.log(`Existing in DB: ${existing.length} people.`);

  // Build a candidate list filtering out anything that already matches a Person.
  type Candidate = {
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    linkedin_url: string;
    linkedin_handle: string | null;
    email: string | null;
    company: string | null;
    position: string | null;
    connected_on: string | null;
    raw: LinkedInRow;
  };

  const candidates: Candidate[] = [];
  let skippedNoName = 0;
  let skippedNoUrl = 0;
  let alreadyInPeople = 0;

  // Within-batch dedup by URL, in case the export repeats a row.
  const seenUrls = new Set<string>();

  for (const r of rows) {
    const first = (r["First Name"] ?? "").trim();
    const last = (r["Last Name"] ?? "").trim();
    const fullName = `${first} ${last}`.trim();
    if (!fullName) {
      skippedNoName++;
      continue;
    }
    const url = normalizeUrl(r.URL);
    if (!url) {
      skippedNoUrl++;
      continue;
    }
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    const handle = extractLinkedinHandle(r.URL);
    const email = normalizeEmail(r["Email Address"]);

    // Skip if matches an existing Person by linkedin or email.
    if (handle && idx.byLinkedin.has(normalizeLinkedin(handle)!)) {
      alreadyInPeople++;
      continue;
    }
    if (email && idx.byEmail.has(email)) {
      alreadyInPeople++;
      continue;
    }

    candidates.push({
      full_name: fullName,
      first_name: first || null,
      last_name: last || null,
      linkedin_url: url,
      linkedin_handle: handle ?? null,
      email,
      company: r.Company?.trim() || null,
      position: r.Position?.trim() || null,
      connected_on: parseConnectedOn(r["Connected On"]),
      raw: r,
    });
  }

  console.log(`\n  parsed             ${rows.length}`);
  console.log(`  skipped (no name)  ${skippedNoName}`);
  console.log(`  skipped (no url)   ${skippedNoUrl}`);
  console.log(`  already in people  ${alreadyInPeople}`);
  console.log(`  candidates to stage ${candidates.length}`);

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to upsert into connection_candidates.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Upsert in batches. ON CONFLICT (source, linkedin_url) DO NOTHING preserves
  // existing accept/reject/merge state — accepted/rejected rows must not be
  // resurrected by a re-import.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const slice = candidates.slice(i, i + BATCH).map((c) => ({
      source: "linkedin",
      ...c,
    }));
    const { data, error } = await db
      .from("connection_candidates")
      .upsert(slice, { onConflict: "source,linkedin_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    inserted += data?.length ?? 0;
    console.log(`  upserted ${Math.min(i + BATCH, candidates.length)} / ${candidates.length}  (${data?.length ?? 0} new)`);
  }
  console.log(`\nDone. ${inserted} new pending rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
