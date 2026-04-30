/**
 * Extraction eval harness.
 *
 * Reads data/eval/extraction-cases.jsonl, runs each note through the v2
 * extractor, scores it against the expectations declared per case.
 *
 * Expectations supported per case:
 *   observations_count_min       — at least N observations were emitted.
 *   must_mention_persons[]       — every name must appear as a mention.text
 *                                   (substring match).
 *   must_have_facets[]           — for each {type, direction?, ...} entry,
 *                                   at least one observation matches.
 *   must_have_person_updates[]   — for each {field, new_value_contains?},
 *                                   at least one update matches.
 *
 * Usage:
 *   npx tsx scripts/eval-extraction.ts
 *   npx tsx scripts/eval-extraction.ts --verbose
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  EXTRACTION_SCHEMA_V2,
  compactDirectoryV2,
  compactContextObservations,
  systemPromptV2,
  type DirectoryRowV2,
  type ContextObservation,
} from "../lib/nl-prompt-v2";
import type { ExtractionV2 } from "../lib/nl-types";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-4o-mini";
const verbose = process.argv.includes("--verbose");

interface FacetExpectation {
  type: string;
  [k: string]: unknown;
}
interface PersonUpdateExpectation {
  field: string;
  new_value_contains?: string;
}
interface Case {
  note: string;
  expected: {
    observations_count_min?: number;
    must_mention_persons?: string[];
    must_have_facets?: FacetExpectation[];
    must_have_person_updates?: PersonUpdateExpectation[];
  };
}

function readCases(): Case[] {
  const path = join(process.cwd(), "data", "eval", "extraction-cases.jsonl");
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Case);
}

async function loadDirectory(): Promise<DirectoryRowV2[]> {
  const { data, error } = await supa
    .from("people")
    .select("id, full_name, aliases, company, role, tags, closeness")
    .eq("archived", false);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    aliases: p.aliases,
    company: p.company,
    role: p.role,
    tags: p.tags,
    closeness: p.closeness,
    narrative_snippet: null,
  }));
}

async function runOne(c: Case): Promise<ExtractionV2> {
  const directoryRows = await loadDirectory();
  const directory = compactDirectoryV2(directoryRows);
  const contextObs: ContextObservation[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: EXTRACTION_SCHEMA_V2 as never,
    },
    messages: [
      {
        role: "system",
        content: systemPromptV2(directory, compactContextObservations(contextObs)),
      },
      {
        role: "user",
        content: `Hoy es ${today}.\n\n## Nota\n${c.note.trim()}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty extraction");
  return JSON.parse(raw) as ExtractionV2;
}

interface CaseResult {
  note: string;
  pass: boolean;
  failures: string[];
}

function score(c: Case, ex: ExtractionV2): CaseResult {
  const fails: string[] = [];
  if (
    c.expected.observations_count_min !== undefined &&
    ex.observations.length < c.expected.observations_count_min
  ) {
    fails.push(
      `observations: got ${ex.observations.length}, expected ≥ ${c.expected.observations_count_min}`
    );
  }
  for (const name of c.expected.must_mention_persons ?? []) {
    const allMentions = new Set<string>();
    for (const o of ex.observations) {
      allMentions.add(o.primary_mention.text.toLowerCase());
      for (const p of o.participants) allMentions.add(p.mention.text.toLowerCase());
    }
    for (const u of ex.person_updates) allMentions.add(u.primary_mention.text.toLowerCase());
    const found = [...allMentions].some((m) => m.includes(name.toLowerCase()));
    if (!found) fails.push(`missing mention of "${name}"`);
  }
  for (const f of c.expected.must_have_facets ?? []) {
    const matched = ex.observations.some((o) => {
      try {
        const facets = JSON.parse(o.facets.raw || "{}") as Record<string, unknown>;
        if (facets.type !== f.type) return false;
        for (const [k, v] of Object.entries(f)) {
          if (k === "type") continue;
          if (facets[k] !== v) return false;
        }
        return true;
      } catch {
        return false;
      }
    });
    if (!matched) fails.push(`no observation with facets ${JSON.stringify(f)}`);
  }
  for (const u of c.expected.must_have_person_updates ?? []) {
    const matched = ex.person_updates.some((pu) => {
      if (pu.field !== u.field) return false;
      if (
        u.new_value_contains &&
        !pu.new_value.toLowerCase().includes(u.new_value_contains.toLowerCase())
      )
        return false;
      return true;
    });
    if (!matched) fails.push(`no person_update matching ${JSON.stringify(u)}`);
  }
  return { note: c.note, pass: fails.length === 0, failures: fails };
}

async function main() {
  const cases = readCases();
  console.log(`Running ${cases.length} cases against ${MODEL}…\n`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    const ex = await runOne(c);
    const r = score(c, ex);
    results.push(r);
    const mark = r.pass ? "✓" : "✗";
    console.log(`${mark} ${c.note.slice(0, 70)}…`);
    if (!r.pass) {
      for (const f of r.failures) console.log(`    - ${f}`);
    }
    if (verbose) {
      console.log(`    ${ex.observations.length} obs, ${ex.person_updates.length} updates, ${ex.warnings.length} warnings`);
    }
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed.`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
