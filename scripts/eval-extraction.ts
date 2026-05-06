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

interface FacetExpectationLegacy {
  type: string;
  [k: string]: unknown;
}
interface PersonUpdateExpectation {
  field: string;
  new_value_contains?: string;
}
interface ConfidenceExpectation {
  text_contains: string;
  confidence_in: Array<"high" | "medium" | "low">;
}
interface FacetExpectationV2 {
  type: string;
  filters?: Record<string, unknown>;
  min_count: number;
}
interface InvariantsV2 {
  observations_count: { min: number; max: number };
  must_mention_persons: string[];
  must_not_mention_persons: string[];
  must_mention_organizations: string[];
  must_have_facets: FacetExpectationV2[];
  warnings_count: { min: number; max: number };
}
interface Case {
  // shared
  id?: string;
  source_extraction_id?: string;
  note: string;
  note_context?: string | null;
  tags?: string[];
  priority?: number;
  notes?: string | null;
  // legacy and v2 expectations are both supported on `expected`
  expected: {
    // legacy fields
    observations_count_min?: number;
    must_mention_persons?: string[];
    must_have_facets?: FacetExpectationLegacy[];
    must_have_person_updates?: PersonUpdateExpectation[];
    must_have_mentions_with_confidence?: ConfidenceExpectation[];
    // v2 fields
    observations_count?: { min: number; max: number };
    must_not_mention_persons?: string[];
    must_mention_organizations?: string[];
    warnings_count?: { min: number; max: number };
  };
}

function isV2(c: Case): boolean {
  return typeof c.expected.observations_count === "object" && c.expected.observations_count !== null;
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
    .select("id, full_name, aliases, company, role, tags, closeness, prior_score")
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
    prior_score: Number(p.prior_score ?? 0),
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

interface InvariantResult {
  invariant: string;
  passed: boolean;
  actual?: unknown;
  expected?: unknown;
}
interface CaseResult {
  caseId?: string;
  note: string;
  pass: boolean;
  failures: string[];
  invariantResults: InvariantResult[];
}

function scoreV2(c: Case, ex: ExtractionV2): CaseResult {
  const exp = c.expected as InvariantsV2 & Case["expected"];
  const fails: string[] = [];
  const results: InvariantResult[] = [];

  // observations_count
  const obsCount = ex.observations.length;
  const obsExpected = exp.observations_count!;
  const obsPassed = obsCount >= obsExpected.min && obsCount <= obsExpected.max;
  results.push({ invariant: "observations_count", passed: obsPassed, actual: obsCount, expected: obsExpected });
  if (!obsPassed) fails.push(`observations: got ${obsCount}, expected [${obsExpected.min}, ${obsExpected.max}]`);

  // mentions persons (substring match against names — but for v2 we treat ids as id strings; mention.text contains a name)
  const allMentionTexts = new Set<string>();
  for (const o of ex.observations) {
    allMentionTexts.add(o.primary_mention.text.toLowerCase());
    for (const p of o.participants) allMentionTexts.add(p.mention.text.toLowerCase());
  }
  for (const u of ex.person_updates) allMentionTexts.add(u.primary_mention.text.toLowerCase());
  // collect mention candidate ids
  const allCandidateIds = new Set<string>();
  for (const o of ex.observations) {
    for (const id of o.primary_mention.candidate_ids ?? []) allCandidateIds.add(id);
    for (const p of o.participants) for (const id of p.mention.candidate_ids ?? []) allCandidateIds.add(id);
  }
  for (const u of ex.person_updates) for (const id of u.primary_mention.candidate_ids ?? []) allCandidateIds.add(id);

  const missingMust = (exp.must_mention_persons ?? []).filter((id) => !allCandidateIds.has(id));
  const must = missingMust.length === 0;
  results.push({ invariant: "must_mention_persons", passed: must, actual: [...allCandidateIds], expected: exp.must_mention_persons });
  if (!must) fails.push(`missing mentions of person ids: ${missingMust.join(", ")}`);

  const violatingNot = (exp.must_not_mention_persons ?? []).filter((id) => allCandidateIds.has(id));
  const notOk = violatingNot.length === 0;
  results.push({ invariant: "must_not_mention_persons", passed: notOk, actual: violatingNot, expected: exp.must_not_mention_persons });
  if (!notOk) fails.push(`forbidden person ids appeared: ${violatingNot.join(", ")}`);

  // facets
  for (const f of exp.must_have_facets ?? []) {
    let count = 0;
    for (const o of ex.observations) {
      try {
        const facets = JSON.parse(o.facets.raw || "{}") as Record<string, unknown>;
        if (facets.type !== f.type) continue;
        if (f.filters) {
          let ok = true;
          for (const [k, v] of Object.entries(f.filters)) {
            if (facets[k] !== v) { ok = false; break; }
          }
          if (!ok) continue;
        }
        count++;
      } catch {}
    }
    const passed = count >= f.min_count;
    results.push({ invariant: `facet:${f.type}`, passed, actual: count, expected: f });
    if (!passed) fails.push(`facet ${JSON.stringify(f)}: got ${count}, expected ≥ ${f.min_count}`);
  }

  // warnings
  const warnCount = ex.warnings.length;
  const warnExpected = exp.warnings_count!;
  const warnPassed = warnCount >= warnExpected.min && warnCount <= warnExpected.max;
  results.push({ invariant: "warnings_count", passed: warnPassed, actual: warnCount, expected: warnExpected });
  if (!warnPassed) fails.push(`warnings: got ${warnCount}, expected [${warnExpected.min}, ${warnExpected.max}]`);

  return { caseId: c.id, note: c.note, pass: fails.length === 0, failures: fails, invariantResults: results };
}

function score(c: Case, ex: ExtractionV2): CaseResult {
  if (isV2(c)) return scoreV2(c, ex);
  // legacy path
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
  for (const exp of c.expected.must_have_mentions_with_confidence ?? []) {
    type M = { text: string; confidence?: "high" | "medium" | "low" };
    const all: M[] = [];
    for (const o of ex.observations) {
      all.push(o.primary_mention);
      for (const p of o.participants) all.push(p.mention);
    }
    for (const u of ex.person_updates) all.push(u.primary_mention);
    const matched = all.find((m) =>
      m.text.toLowerCase().includes(exp.text_contains.toLowerCase())
    );
    if (!matched) {
      fails.push(`no mention containing "${exp.text_contains}"`);
      continue;
    }
    if (!matched.confidence) {
      fails.push(`mention "${matched.text}" has no confidence field`);
    } else if (!exp.confidence_in.includes(matched.confidence)) {
      fails.push(
        `mention "${matched.text}" confidence=${matched.confidence}, expected one of ${exp.confidence_in.join(",")}`
      );
    }
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
  return { caseId: c.id, note: c.note, pass: fails.length === 0, failures: fails, invariantResults: [] };
}

async function appendEvalRun(c: Case, r: CaseResult, durationMs: number): Promise<void> {
  if (!c.id) return;
  try {
    // Read current eval_runs, append, write back. Simple, atomic-enough for single-user.
    const { data, error } = await supa.from("eval_cases").select("eval_runs").eq("id", c.id).maybeSingle();
    if (error || !data) return;
    const runs = (data.eval_runs as Array<Record<string, unknown>>) ?? [];
    runs.push({
      run_at: new Date().toISOString(),
      prompt_version: "v2",
      model: MODEL,
      passed: r.pass,
      invariant_results: r.invariantResults,
      duration_ms: durationMs,
    });
    await supa.from("eval_cases").update({ eval_runs: runs }).eq("id", c.id);
  } catch (e) {
    console.warn("appendEvalRun failed", e);
  }
}

async function main() {
  const cases = readCases();
  console.log(`Running ${cases.length} cases against ${MODEL}…\n`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    const start = Date.now();
    const ex = await runOne(c);
    const durationMs = Date.now() - start;
    const r = score(c, ex);
    results.push(r);
    await appendEvalRun(c, r, durationMs);
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
