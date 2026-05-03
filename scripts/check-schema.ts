/**
 * Checks whether the schema migration has been applied. Run this after pasting
 * supabase/migrations/0001_init.sql into the Supabase SQL editor to verify the
 * tables exist before seeding.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = ["people", "events", "encounters", "interactions", "edges", "observations", "observation_participants", "person_profiles"] as const;

async function main() {
  let missing = 0;
  for (const t of tables) {
    const { error, count } = await db.from(t).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`✗ ${t}: ${error.code} ${error.message}`);
      missing++;
    } else {
      console.log(`✓ ${t}: ${count ?? 0} rows`);
    }
  }
  if (missing > 0) {
    console.log(`\nMigration not applied (${missing}/${tables.length} tables missing).`);
    console.log("Paste supabase/migrations/0001_init.sql into:");
    console.log("  https://supabase.com/dashboard/project/tefqtdoxljvlnwithvts/sql/new");
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
