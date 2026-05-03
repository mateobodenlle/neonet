/**
 * Seeds the Supabase database with the mock dataset from lib/mock-data.ts.
 *
 * Idempotency: skips if any table already has rows. Pass --force to truncate
 * everything and reseed from scratch.
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --force
 *
 * Auth: requires SUPABASE_SERVICE_ROLE_KEY (RLS bypass) in .env.local.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { mockDatabase } from "../lib/mock-data";
import {
  personToRow,
  eventToRow,
  encounterToRow,
  interactionToRow,
  edgeToRow,
} from "../lib/mappers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const force = process.argv.includes("--force");

// Untyped client: scripts deal in raw rows, no need for the schema generic.
const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Date strings in mock data may include time portion. Date columns need YYYY-MM-DD.
const day = (s: string) => s.slice(0, 10);

async function isEmpty() {
  const tables = ["people", "events", "encounters", "interactions", "edges"] as const;
  for (const t of tables) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) return false;
  }
  return true;
}

async function truncateAll() {
  // Order matters: children first.
  for (const t of ["edges", "interactions", "encounters", "events", "people"] as const) {
    const { error } = await db.from(t).delete().neq("id", "");
    if (error) throw error;
  }
}

async function seed() {
  const empty = await isEmpty();
  if (!empty && !force) {
    console.log("Tables already populated. Pass --force to wipe and reseed.");
    return;
  }
  if (force) {
    console.log("--force: truncating all tables ...");
    await truncateAll();
  }

  // people first so FKs resolve.
  const peopleRows = mockDatabase.people.map(personToRow);
  console.log(`Inserting ${peopleRows.length} people ...`);
  {
    const { error } = await db.from("people").insert(peopleRows);
    if (error) throw error;
  }

  const eventRows = mockDatabase.events.map((e) => ({
    ...eventToRow(e),
    date: day(e.date),
    end_date: e.endDate ? day(e.endDate) : null,
  }));
  console.log(`Inserting ${eventRows.length} events ...`);
  {
    const { error } = await db.from("events").insert(eventRows);
    if (error) throw error;
  }

  const encounterRows = mockDatabase.encounters.map((en) => ({
    ...encounterToRow(en),
    date: day(en.date),
  }));
  console.log(`Inserting ${encounterRows.length} encounters ...`);
  {
    const { error } = await db.from("encounters").insert(encounterRows);
    if (error) throw error;
  }

  const interactionRows = mockDatabase.interactions.map((i) => ({
    ...interactionToRow(i),
    date: day(i.date),
  }));
  console.log(`Inserting ${interactionRows.length} interactions ...`);
  {
    const { error } = await db.from("interactions").insert(interactionRows);
    if (error) throw error;
  }

  const edgeRows = mockDatabase.edges.map(edgeToRow);
  console.log(`Inserting ${edgeRows.length} edges ...`);
  {
    const { error } = await db.from("edges").insert(edgeRows);
    if (error) throw error;
  }

  console.log("Seed complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
