import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

(async () => {
  const c = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(
    "select name, default_version, installed_version from pg_available_extensions where name in ('vector','pgcrypto')"
  );
  console.log(r.rows);
  await c.end();
})();
