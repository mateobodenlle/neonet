/**
 * Smoke test for embeddings:
 *   - inserts 3 observations on a real person
 *   - generates embeddings via OpenAI
 *   - runs semantic queries through the search_observations RPC
 *   - cleans up
 *
 * Doesn't import lib/embeddings.ts directly because lib/* modules import
 * `server-only`, which blocks tsx scripts. The logic is inlined here so we
 * can validate the SQL + RPC end-to-end.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

function vectorToWire(v: number[]): string {
  return `[${v.join(",")}]`;
}

async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return r.data[0].embedding;
}

async function main() {
  const { data: people, error } = await supa
    .from("people")
    .select("id, full_name")
    .eq("archived", false)
    .limit(1);
  if (error) throw error;
  const subject = people?.[0];
  if (!subject) throw new Error("No people in DB to test against.");
  console.log(`Testing with person: ${subject.full_name} (${subject.id})`);

  const samples = [
    {
      content: "Trabaja como CTO en una fintech, lleva el equipo de pagos.",
      facets: { type: "profesional" },
    },
    {
      content: "Le preocupa el fraude en banca y la migración a la nube.",
      facets: { type: "pain_point" },
    },
    {
      content: "Le gusta correr maratones, hizo el de Madrid el año pasado.",
      facets: { type: "personal", topic: "deporte" },
    },
  ];

  const ids: string[] = [];
  for (const s of samples) {
    const id = randomUUID();
    ids.push(id);
    const { error: ie } = await supa.from("observations").insert({
      id,
      primary_person_id: subject.id,
      content: s.content,
      observed_at: new Date().toISOString().slice(0, 10),
      source: "manual",
      facets: s.facets,
    });
    if (ie) throw ie;
    await supa.from("observation_participants").insert({
      observation_id: id,
      person_id: subject.id,
      role: "primary",
    });
    const facetType = String(s.facets.type);
    const v = await embed(`[${facetType}] ${s.content}`);
    const { error: ue } = await supa
      .from("observations")
      .update({ embedding: vectorToWire(v), embedding_model: EMBEDDING_MODEL })
      .eq("id", id);
    if (ue) throw ue;
    console.log(`  embedded: ${s.content.slice(0, 50)}…`);
  }

  const queries = ["fraude bancario", "running", "carrera profesional en pagos"];
  for (const q of queries) {
    const qv = await embed(q);
    const { data, error: re } = await supa.rpc("search_observations", {
      query_embedding: vectorToWire(qv),
      match_limit: 3,
      filter_person_id: null,
      min_score: 0,
    });
    if (re) throw re;
    console.log(`\nQ: "${q}"`);
    for (const row of (data ?? []) as Array<{ observation: { content: string }; score: number }>) {
      console.log(`  ${row.score.toFixed(3)}  ${row.observation.content.slice(0, 70)}`);
    }
  }

  // cleanup
  await supa.from("observations").delete().in("id", ids);
  console.log(`\nCleaned up ${ids.length} test observations.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
