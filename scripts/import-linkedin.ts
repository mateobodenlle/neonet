/**
 * Imports a LinkedIn Connections.csv export into the people table.
 *
 * The export comes from: linkedin.com → Settings → Data privacy → Get a copy
 * of your data → "Connections". You receive a ZIP with Connections.csv.
 *
 * Expected columns (LinkedIn export 2024+):
 *   First Name, Last Name, URL, Email Address, Company, Position, Connected On
 *
 * Recent exports prefix the file with a "Notes:" preamble — we skip rows
 * until we find the header line.
 *
 * Usage:
 *   npm run import:linkedin -- data/linkedin/Connections.csv
 *   npm run import:linkedin -- data/linkedin/Connections.csv --commit
 *
 * Defaults: category="otro", temperature="frio", tags=["from-linkedin"].
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { Person } from "../lib/types";
import { fetchExistingPeople, classify, printReport, commit } from "./lib/import-runner";

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
  // LinkedIn often prepends a "Notes:" block before the actual CSV header.
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
    if (inIdx >= 0 && parts[inIdx + 1]) return parts[inIdx + 1];
    return parts[0] || undefined;
  } catch {
    return undefined;
  }
}

function rowToPerson(row: LinkedInRow): Person | null {
  const first = (row["First Name"] ?? "").trim();
  const last = (row["Last Name"] ?? "").trim();
  const fullName = `${first} ${last}`.trim();
  if (!fullName) return null;

  const handles: Person["handles"] = {};
  const email = (row["Email Address"] ?? "").trim();
  if (email) handles.email = email;
  const handle = extractLinkedinHandle(row.URL);
  if (handle) handles.linkedin = handle;

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    fullName,
    aliases: [],
    role: row.Position?.trim() || undefined,
    company: row.Company?.trim() || undefined,
    category: "otro",
    temperature: "frio",
    tags: ["from-linkedin"],
    handles: Object.keys(handles).length ? handles : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  const doCommit = args.includes("--commit");
  if (!file) {
    console.error("Usage: npm run import:linkedin -- <path-to-Connections.csv> [--commit]");
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

  const candidates: Person[] = [];
  let skipped = 0;
  for (const r of rows) {
    const p = rowToPerson(r);
    if (p) candidates.push(p);
    else skipped++;
  }
  if (skipped) console.log(`Skipped ${skipped} rows with no name.`);

  const existing = await fetchExistingPeople();
  console.log(`Existing in DB: ${existing.length} people.`);

  const result = classify(candidates, existing);
  printReport("LinkedIn import", result);

  if (!doCommit) {
    console.log("\nDry run. Re-run with --commit to insert the new rows.");
    return;
  }

  if (result.newRows.length === 0) {
    console.log("\nNothing new to commit.");
    return;
  }

  console.log(`\nCommitting ${result.newRows.length} new rows ...`);
  await commit(result.newRows);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
