/**
 * Synthesis eval harness.
 *
 * Each case in data/eval/synthesis-cases.jsonl is a synthetic person +
 * observations bundle, run through the synthesis prompt directly (no DB
 * mutation). Compares the produced narrative against expectations.
 *
 * Usage:
 *   npx tsx scripts/eval-synthesis.ts
 *   npx tsx scripts/eval-synthesis.ts --verbose
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import {
  PROFILE_SCHEMA,
  profileSystemPrompt,
  profileUserMessage,
  type SynthesisObservationLine,
} from "../lib/profile-prompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_SYNTHESIS_MODEL ?? "gpt-4o";
const verbose = process.argv.includes("--verbose");

interface CaseObservation {
  observed_at: string;
  content: string;
  facetType: string | null;
}
interface Case {
  person: {
    full_name: string;
    role?: string;
    company?: string;
    location?: string;
    tags?: string[];
  };
  observations: CaseObservation[];
  expected: {
    narrative_must_mention?: string[];
    recurring_themes_min?: number;
    active_threads_min?: number;
  };
}

interface LLMOut {
  narrative: string;
  resolved_facts: { raw: string };
  recurring_themes: string[];
  active_threads: Array<{ title: string; status: string }>;
}

function readCases(): Case[] {
  const path = join(process.cwd(), "data", "eval", "synthesis-cases.jsonl");
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Case);
}

async function runOne(c: Case): Promise<LLMOut> {
  const today = new Date().toISOString().slice(0, 10);
  const obs: SynthesisObservationLine[] = c.observations.map((o, i) => ({
    id: `eval-${i}`,
    observed_at: o.observed_at,
    content: o.content,
    facetType: o.facetType,
    source: "manual",
  }));
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_schema", json_schema: PROFILE_SCHEMA as never },
    messages: [
      { role: "system", content: profileSystemPrompt(today) },
      {
        role: "user",
        content: profileUserMessage({
          fullName: c.person.full_name,
          basics: {
            role: c.person.role,
            company: c.person.company,
            location: c.person.location,
            tags: c.person.tags,
          },
          previousNarrative: null,
          observations: obs,
        }),
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty synthesis");
  return JSON.parse(raw) as LLMOut;
}

interface CaseResult {
  name: string;
  pass: boolean;
  failures: string[];
}

function score(c: Case, out: LLMOut): CaseResult {
  const fails: string[] = [];
  for (const phrase of c.expected.narrative_must_mention ?? []) {
    if (!out.narrative.toLowerCase().includes(phrase.toLowerCase())) {
      fails.push(`narrative missing "${phrase}"`);
    }
  }
  if (
    c.expected.recurring_themes_min !== undefined &&
    out.recurring_themes.length < c.expected.recurring_themes_min
  ) {
    fails.push(
      `recurring_themes: got ${out.recurring_themes.length}, expected ≥ ${c.expected.recurring_themes_min}`
    );
  }
  if (
    c.expected.active_threads_min !== undefined &&
    out.active_threads.length < c.expected.active_threads_min
  ) {
    fails.push(
      `active_threads: got ${out.active_threads.length}, expected ≥ ${c.expected.active_threads_min}`
    );
  }
  return { name: c.person.full_name, pass: fails.length === 0, failures: fails };
}

async function main() {
  const cases = readCases();
  console.log(`Running ${cases.length} cases against ${MODEL}…\n`);
  let passed = 0;
  for (const c of cases) {
    const out = await runOne(c);
    const r = score(c, out);
    const mark = r.pass ? "✓" : "✗";
    console.log(`${mark} ${r.name}`);
    if (!r.pass) for (const f of r.failures) console.log(`    - ${f}`);
    if (verbose) {
      console.log(`    narrative: ${out.narrative}`);
      console.log(`    themes: ${out.recurring_themes.join(", ")}`);
      console.log(`    threads: ${out.active_threads.map((t) => `${t.title}(${t.status})`).join(", ")}`);
    }
    if (r.pass) passed++;
  }
  console.log(`\n${passed}/${cases.length} passed.`);
  if (passed < cases.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
