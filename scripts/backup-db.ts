/**
 * Dumps every table in the public schema to backups/<timestamp>/<table>.json.
 *
 * Auth: SUPABASE_DB_URL from .env.local. Reads through the direct Postgres
 * connection (not via Supabase REST) so we get exact row contents including
 * any columns the JS mappers ignore.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local");
  process.exit(1);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join(process.cwd(), "backups", stamp);
  mkdirSync(outDir, { recursive: true });

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const { rows: tables } = await client.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`
  );

  const summary: Record<string, number> = {};
  for (const { table_name } of tables) {
    const { rows } = await client.query(`select * from public."${table_name}"`);
    writeFileSync(join(outDir, `${table_name}.json`), JSON.stringify(rows, null, 2));
    summary[table_name] = rows.length;
    console.log(`✓ ${table_name}: ${rows.length} rows`);
  }

  writeFileSync(
    join(outDir, "_summary.json"),
    JSON.stringify({ takenAt: stamp, tables: summary }, null, 2)
  );

  await client.end();
  console.log(`\nBackup written to ${outDir}`);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
