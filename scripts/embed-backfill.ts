/**
 * Re-embeds observations that lack an embedding_model. Idempotent and
 * resumable — call after migrate-to-observations.ts if it died mid-run,
 * or after switching OPENAI_EMBEDDING_MODEL to migrate vectors.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

const force = process.argv.includes("--force");

function vectorToWire(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function main() {
  const BATCH = 64;
  let total = 0;
  let cursor: string | null = null;
  for (;;) {
    let q = supa
      .from("observations")
      .select("id, content, facets, embedding_model")
      .order("id", { ascending: true })
      .limit(BATCH);
    if (!force) q = q.is("embedding_model", null);
    else q = q.neq("embedding_model", EMBEDDING_MODEL);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;
    const inputs = rows.map((r) => {
      const facetType =
        r.facets && typeof r.facets === "object" && "type" in r.facets
          ? String((r.facets as Record<string, unknown>).type)
          : null;
      return facetType ? `[${facetType}] ${r.content}` : r.content;
    });
    const r = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
    for (let i = 0; i < rows.length; i++) {
      const v = r.data[i].embedding;
      const { error: ue } = await supa
        .from("observations")
        .update({ embedding: vectorToWire(v), embedding_model: EMBEDDING_MODEL })
        .eq("id", rows[i].id);
      if (ue) console.error(`! ${rows[i].id}: ${ue.message}`);
      else total++;
    }
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`  ${total}…\r`);
  }
  process.stdout.write(`\nDone. Embedded ${total} observations.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
