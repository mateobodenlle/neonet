/**
 * Imports a LinkedIn Invitations.csv export into the people table.
 *
 * The Invitations file is included in the LinkedIn "Basic Archive" data
 * export. It only contains names and profile URLs — no role, company or
 * email — so think of it as a thin starting layer to be enriched later
 * by the proper Connections.csv import (which requires explicitly
 * ticking "Connections" when requesting the archive).
 *
 * Expected columns:
 *   From, To, Sent At, Message, Direction, inviterProfileUrl, inviteeProfileUrl
 *
 * Direction is OUTGOING (you invited them — read "To" + inviteeProfileUrl)
 * or INCOMING (they invited you — read "From" + inviterProfileUrl).
 *
 * Usage:
 *   npm run import:linkedin-invitations -- data/linkedin/Invitations.csv
 *   npm run import:linkedin-invitations -- data/linkedin/Invitations.csv --commit
 *
 * Defaults: category="otro", temperature="frio", tags=["from-linkedin-invitations"].
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import type { Person } from "../lib/types";
import { fetchExistingPeople, classify, printReport, commit } from "./lib/import-runner";

interface InvitationRow {
  From?: string;
  To?: string;
  "Sent At"?: string;
  Message?: string;
  Direction?: string;
  inviterProfileUrl?: string;
  inviteeProfileUrl?: string;
}

function extractLinkedinHandle(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const parts = path.split("/");
    const inIdx = parts.indexOf("in");
    if (inIdx >= 0 && parts[inIdx + 1]) return decodeURIComponent(parts[inIdx + 1]);
    return parts[0] || undefined;
  } catch {
    return undefined;
  }
}

function rowToPerson(row: InvitationRow): Person | null {
  const direction = (row.Direction ?? "").trim().toUpperCase();
  let name: string | undefined;
  let url: string | undefined;
  if (direction === "OUTGOING") {
    name = row.To?.trim();
    url = row.inviteeProfileUrl?.trim();
  } else if (direction === "INCOMING") {
    name = row.From?.trim();
    url = row.inviterProfileUrl?.trim();
  } else {
    // Unknown direction — skip rather than guess.
    return null;
  }
  if (!name) return null;

  const handle = extractLinkedinHandle(url);
  const handles: Person["handles"] = {};
  if (handle) handles.linkedin = handle;

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    fullName: name,
    aliases: [],
    category: "otro",
    temperature: "frio",
    tags: ["from-linkedin-invitations"],
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
    console.error("Usage: npm run import:linkedin-invitations -- <path-to-Invitations.csv> [--commit]");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf8");
  const rows: InvitationRow[] = parse(raw, {
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
  if (skipped) console.log(`Skipped ${skipped} rows (unknown direction or missing name).`);

  const existing = await fetchExistingPeople();
  console.log(`Existing in DB: ${existing.length} people.`);

  const result = classify(candidates, existing);
  printReport("LinkedIn Invitations import", result);

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
