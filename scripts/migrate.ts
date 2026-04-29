/**
 * Applies every SQL file in supabase/migrations/ in lexicographic order.
 *
 * Tracks applied migrations in public._migrations so it is idempotent. Re-run
 * after adding a new file in supabase/migrations/.
 *
 * Auth: requires SUPABASE_DB_URL (direct Postgres connection, not the pooler)
 * in .env.local.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");

async function main() {
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) {
    console.log("No migrations found.");
    await client.end();
    return;
  }

  const { rows: applied } = await client.query<{ name: string }>("select name from public._migrations");
  const appliedSet = new Set(applied.map((r) => r.name));

  for (const f of files) {
    if (appliedSet.has(f)) {
      console.log(`· ${f} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    console.log(`→ applying ${f} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations(name) values ($1)", [f]);
      await client.query("commit");
      console.log(`✓ ${f}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`✗ ${f} failed:`, err);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log("\nAll migrations up to date.");
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
