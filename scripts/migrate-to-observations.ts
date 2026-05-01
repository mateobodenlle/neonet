/**
 * Backfills legacy pain_points, promises and interactions.body into the
 * observations / observation_participants tables.
 *
 * Idempotent — uses deterministic ids derived from the source row id so a
 * re-run upserts in place. Safe to interrupt; re-running picks up where it
 * left off because of the upsert + primary key.
 *
 * Embeddings are generated in the same loop. If you hit OpenAI rate limits,
 * stop and re-run; rows already embedded are skipped (embedding_model is
 * set as a sentinel).
 *
 * Usage:
 *   npx tsx scripts/migrate-to-observations.ts            # full run
 *   npx tsx scripts/migrate-to-observations.ts --no-embed # schema-only
 *   npx tsx scripts/migrate-to-observations.ts --only=pain_points
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

const args = new Set(process.argv.slice(2));
const noEmbed = args.has("--no-embed");
const onlyArg = [...args].find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice("--only=".length) : null;

function vectorToWire(v: number[]): string {
  return `[${v.join(",")}]`;
}

// Deterministic id derivation. Same input row → same observation id, so
// re-runs upsert in place. Format: legacy-<source>-<original-id>.
function idFor(source: string, originalId: string): string {
  return `legacy-${source}-${originalId}`;
}

async function migratePainPoints(): Promise<number> {
  const { data, error } = await supa
    .from("pain_points")
    .select("id, person_id, description, created_at, resolved");
  if (error) throw error;
  let n = 0;
  for (const r of data ?? []) {
    const obsId = idFor("pp", r.id);
    const facets: Record<string, unknown> = { type: "pain_point" };
    if (r.resolved) facets.resolved = true;
    const { error: ie } = await supa.from("observations").upsert(
      {
        id: obsId,
        primary_person_id: r.person_id,
        content: r.description,
        observed_at: String(r.created_at).slice(0, 10),
        source: "legacy-pain-point",
        tags: [],
        facets,
      },
      { onConflict: "id" }
    );
    if (ie) {
      console.error(`  ! pain_point ${r.id}: ${ie.message}`);
      continue;
    }
    await supa.from("observation_participants").upsert(
      { observation_id: obsId, person_id: r.person_id, role: "primary" },
      { onConflict: "observation_id,person_id,role" }
    );
    n++;
  }
  return n;
}

async function migratePromises(): Promise<number> {
  const { data, error } = await supa
    .from("promises")
    .select("id, person_id, also_person_ids, description, direction, due_date, done, completed_at, created_at");
  if (error) throw error;
  let n = 0;
  for (const r of data ?? []) {
    const obsId = idFor("pr", r.id);
    const facets: Record<string, unknown> = {
      type: "promesa",
      direction: r.direction,
    };
    if (r.due_date) facets.due_date = r.due_date;
    if (r.done) facets.done = true;
    if (r.completed_at) facets.completed_at = r.completed_at;
    const { error: ie } = await supa.from("observations").upsert(
      {
        id: obsId,
        primary_person_id: r.person_id,
        content: r.description,
        observed_at: String(r.created_at).slice(0, 10),
        source: "legacy-promise",
        tags: [],
        facets,
      },
      { onConflict: "id" }
    );
    if (ie) {
      console.error(`  ! promise ${r.id}: ${ie.message}`);
      continue;
    }
    const parts: Array<{ observation_id: string; person_id: string; role: string }> = [
      { observation_id: obsId, person_id: r.person_id, role: "primary" },
    ];
    for (const pid of r.also_person_ids ?? []) {
      if (pid === r.person_id) continue;
      parts.push({ observation_id: obsId, person_id: pid, role: "promise_target" });
    }
    await supa
      .from("observation_participants")
      .upsert(parts, { onConflict: "observation_id,person_id,role" });
    n++;
  }
  return n;
}

async function migrateInteractions(): Promise<number> {
  const { data, error } = await supa
    .from("interactions")
    .select("id, person_id, kind, date, summary, body, encounter_id");
  if (error) throw error;
  let n = 0;
  for (const r of data ?? []) {
    const text = (r.body ?? "").trim() || (r.summary ?? "").trim();
    if (!text) continue;
    const obsId = idFor("int", r.id);
    const facets: Record<string, unknown> = { type: r.kind };
    if (r.encounter_id) facets.encounter_id = r.encounter_id;
    const { error: ie } = await supa.from("observations").upsert(
      {
        id: obsId,
        primary_person_id: r.person_id,
        content: text,
        observed_at: r.date,
        source: "legacy-interaction",
        tags: [],
        facets,
      },
      { onConflict: "id" }
    );
    if (ie) {
      console.error(`  ! interaction ${r.id}: ${ie.message}`);
      continue;
    }
    await supa.from("observation_participants").upsert(
      { observation_id: obsId, person_id: r.person_id, role: "primary" },
      { onConflict: "observation_id,person_id,role" }
    );
    n++;
  }
  return n;
}

async function embedPending(): Promise<number> {
  // Process in batches by ID. Skip rows already embedded (embedding_model
  // populated). text-embedding-3-small accepts up to 2048 inputs/call but
  // we keep batches small to limit memory + per-call latency.
  const BATCH = 64;
  let total = 0;
  let cursor: string | null = null;
  for (;;) {
    let q = supa
      .from("observations")
      .select("id, content, facets")
      .is("embedding_model", null)
      .order("id", { ascending: true })
      .limit(BATCH);
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
      if (ue) console.error(`  ! embed update ${rows[i].id}: ${ue.message}`);
      else total++;
    }
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`  embedded ${total} so far…\r`);
  }
  process.stdout.write(`\n`);
  return total;
}

async function markAllProfilesDirty(): Promise<number> {
  const { data, error } = await supa.from("people").select("id").eq("archived", false);
  if (error) throw error;
  const now = new Date().toISOString();
  const rows = (data ?? []).map((p) => ({ person_id: p.id, dirty_since: now }));
  if (rows.length === 0) return 0;
  // Upsert in chunks to avoid payload limits.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error: ue } = await supa
      .from("person_profiles")
      .upsert(slice, { onConflict: "person_id" });
    if (ue) throw ue;
  }
  return rows.length;
}

async function main() {
  console.log("Backfilling observations from legacy tables…");
  if (!only || only === "pain_points") {
    const n = await migratePainPoints();
    console.log(`  pain_points → observations: ${n}`);
  }
  if (!only || only === "promises") {
    const n = await migratePromises();
    console.log(`  promises    → observations: ${n}`);
  }
  if (!only || only === "interactions") {
    const n = await migrateInteractions();
    console.log(`  interactions → observations: ${n}`);
  }

  if (!noEmbed) {
    console.log("\nEmbedding observations without embedding_model…");
    const n = await embedPending();
    console.log(`  total embedded: ${n}`);
  } else {
    console.log("\nSkipping embeddings (--no-embed).");
  }

  console.log("\nMarking all non-archived person profiles as dirty…");
  const n = await markAllProfilesDirty();
  console.log(`  profiles marked dirty: ${n}`);

  console.log("\nDone. Run /api/jobs/synthesize (mode=process-dirty) to generate profiles.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
