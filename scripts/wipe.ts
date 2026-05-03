/**
 * Deletes every row from every domain table. Use before importing real data
 * to discard the mock dataset, or to start over.
 *
 * Refuses to run without --confirm.
 *
 *   npm run db:wipe -- --confirm
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const confirm = process.argv.includes("--confirm");
if (!confirm) {
  console.error("Refusing to wipe without --confirm. This deletes every row in every domain table.");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // Children first; FK cascades will mostly handle this, but explicit order
  // keeps the script independent of cascade settings.
  const tables = ["edges", "observation_participants", "observations", "person_profiles", "interactions", "encounters", "events", "people"] as const;
  for (const t of tables) {
    const { error } = await db.from(t).delete().neq("id", "");
    if (error) throw error;
    console.log(`✓ wiped ${t}`);
  }
  console.log("\nAll domain tables empty.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
