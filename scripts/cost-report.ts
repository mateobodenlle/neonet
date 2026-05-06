/**
 * Cost report for the llm_calls table.
 *
 * Read-only. Connects with `pg` directly via SUPABASE_DB_URL and prints a
 * legible per-section summary of OpenAI spend in a configurable time window.
 *
 *   npx tsx scripts/cost-report.ts
 *   npx tsx scripts/cost-report.ts --days=30
 *   npx tsx scripts/cost-report.ts --days=1 --detailed
 *   npx tsx scripts/cost-report.ts --purpose=extraction --days=14
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
import { PRICING_TABLE } from "../lib/openai-pricing";

// ---------- argv ----------

interface Args {
  days: number;
  purpose: string | null;
  detailed: boolean;
}

function parseArgs(argv: string[]): Args {
  let days = 7;
  let purpose: string | null = null;
  let detailed = false;
  for (const arg of argv.slice(2)) {
    if (arg === "--detailed") detailed = true;
    else if (arg.startsWith("--days=")) {
      const n = Number(arg.slice("--days=".length));
      if (!Number.isFinite(n) || n <= 0) {
        console.error(`Invalid --days value: ${arg}`);
        process.exit(1);
      }
      days = n;
    } else if (arg.startsWith("--purpose=")) {
      purpose = arg.slice("--purpose=".length).trim();
      if (!purpose) {
        console.error("--purpose requires a value");
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: tsx scripts/cost-report.ts [--days=7] [--purpose=<name>] [--detailed]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return { days, purpose, detailed };
}

// ---------- formatting ----------

const useColor = process.stdout.isTTY === true && process.env.NO_COLOR == null;
const ansi = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string) => ansi("1", s);
const dim = (s: string) => ansi("2", s);
const green = (s: string) => ansi("32", s);
const yellow = (s: string) => ansi("33", s);
const red = (s: string) => ansi("31", s);

function fmtUsd(n: number | null | undefined, precision = 4): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(precision)}`;
}
function fmtTokens(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function fmtMs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}`;
}
function fmtPct(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}
function fmtDate(d: Date): string {
  // YYYY-MM-DD HH:MM (UTC for stability)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function printHeader(title: string): void {
  console.log("");
  console.log(bold(`=== ${title} ===`));
}

type Cell = string | number | null | undefined;
interface Col { key: string; label: string; align?: "left" | "right" }

function printTable(cols: Col[], rows: Record<string, Cell>[]): void {
  if (rows.length === 0) {
    console.log(dim("(no rows)"));
    return;
  }
  const widths = cols.map((c) => {
    const headerLen = c.label.length;
    const maxRow = rows.reduce((m, r) => Math.max(m, String(r[c.key] ?? "").length), 0);
    return Math.max(headerLen, maxRow);
  });
  const fmtCell = (c: Col, w: number, val: Cell): string => {
    const s = String(val ?? "");
    return c.align === "right" ? s.padStart(w) : s.padEnd(w);
  };
  const headerLine = cols.map((c, i) => bold(fmtCell(c, widths[i], c.label))).join("  ");
  console.log(headerLine);
  for (const row of rows) {
    console.log(cols.map((c, i) => fmtCell(c, widths[i], row[c.key])).join("  "));
  }
}

// ---------- queries ----------

interface SectionCtx {
  client: Client;
  sinceIso: string;
  purpose: string | null;
  days: number;
  detailed: boolean;
}

const CACHEABLE_PURPOSES = [
  "extraction",
  "extraction-for-person",
  "synthesis-incremental",
  "synthesis-rebuild",
];

async function section1Summary(ctx: SectionCtx): Promise<{ calls: number; cost: number }> {
  const { rows } = await ctx.client.query(
    `SELECT
       COUNT(*)::int                                AS calls,
       COALESCE(SUM(cost_usd_estimated), 0)::float  AS cost,
       COALESCE(SUM(prompt_tokens), 0)::bigint      AS in_tokens,
       COALESCE(SUM(cached_tokens), 0)::bigint      AS cached_tokens,
       COALESCE(SUM(completion_tokens), 0)::bigint  AS out_tokens
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)`,
    [ctx.sinceIso, ctx.purpose],
  );
  const r = rows[0] as {
    calls: number;
    cost: number;
    in_tokens: string | number;
    cached_tokens: string | number;
    out_tokens: string | number;
  };
  const calls = Number(r.calls);
  const cost = Number(r.cost);
  const inTok = Number(r.in_tokens);
  const cachedTok = Number(r.cached_tokens);
  const outTok = Number(r.out_tokens);
  const purposeLabel = ctx.purpose ? ` · purpose=${ctx.purpose}` : "";
  printHeader(`Cost Report — last ${ctx.days} day${ctx.days === 1 ? "" : "s"}${purposeLabel}`);
  const totalPrecision = cost >= 1 ? 2 : cost >= 0.1 ? 3 : 4;
  console.log(`Total spent (USD):                 ${green(bold(fmtUsd(cost, totalPrecision)))}`);
  console.log(`Total calls:                       ${calls}`);
  console.log(`Calls/day average:                 ${(calls / ctx.days).toFixed(1)}`);
  console.log(
    `Total tokens (in / cached / out):  ${fmtTokens(inTok)} / ${fmtTokens(cachedTok)} / ${fmtTokens(outTok)}`,
  );
  return { calls, cost };
}

async function section2ByPurpose(ctx: SectionCtx, totalCost: number): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       purpose,
       COUNT(*)::int                                AS calls,
       COALESCE(SUM(cost_usd_estimated), 0)::float  AS cost,
       COALESCE(AVG(cost_usd_estimated), 0)::float  AS avg_cost,
       COALESCE(AVG(duration_ms), 0)::float         AS avg_ms
     FROM llm_calls
     WHERE created_at >= $1
     GROUP BY purpose
     ORDER BY cost DESC`,
    [ctx.sinceIso],
  );
  printHeader("By purpose");
  printTable(
    [
      { key: "purpose", label: "purpose" },
      { key: "calls", label: "calls", align: "right" },
      { key: "cost", label: "total $", align: "right" },
      { key: "pct", label: "%", align: "right" },
      { key: "avg", label: "avg $/call", align: "right" },
      { key: "ms", label: "avg ms", align: "right" },
    ],
    rows.map((r) => ({
      purpose: r.purpose,
      calls: r.calls,
      cost: fmtUsd(Number(r.cost), 3),
      pct: fmtPct(Number(r.cost), totalCost),
      avg: fmtUsd(Number(r.avg_cost), 4),
      ms: fmtMs(Number(r.avg_ms)),
    })),
  );
}

async function section3Cache(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       purpose,
       model,
       COUNT(*) FILTER (WHERE COALESCE(cached_tokens,0) > 0)::int AS cached_calls,
       COUNT(*) FILTER (WHERE COALESCE(cached_tokens,0) = 0)::int AS cold_calls,
       COALESCE(SUM(cached_tokens), 0)::bigint                    AS cached_tokens_total,
       COALESCE(SUM(prompt_tokens), 0)::bigint                    AS prompt_tokens_total
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
       AND purpose = ANY($3::text[])
     GROUP BY purpose, model
     ORDER BY purpose, model`,
    [ctx.sinceIso, ctx.purpose, CACHEABLE_PURPOSES],
  );
  if (rows.length === 0) return;
  // Roll up by purpose, summing savings across models.
  type Agg = {
    cached: number;
    cold: number;
    cachedTokens: number;
    promptTokens: number;
    saved: number;
    unknownModels: Set<string>;
  };
  const byPurpose = new Map<string, Agg>();
  for (const r of rows) {
    const purpose = r.purpose as string;
    const model = r.model as string;
    const cachedTokens = Number(r.cached_tokens_total);
    const promptTokens = Number(r.prompt_tokens_total);
    const rates = PRICING_TABLE[model];
    const saved = rates ? (cachedTokens * (rates.input - rates.cachedInput)) / 1_000_000 : 0;
    const a = byPurpose.get(purpose) ?? {
      cached: 0,
      cold: 0,
      cachedTokens: 0,
      promptTokens: 0,
      saved: 0,
      unknownModels: new Set<string>(),
    };
    a.cached += Number(r.cached_calls);
    a.cold += Number(r.cold_calls);
    a.cachedTokens += cachedTokens;
    a.promptTokens += promptTokens;
    a.saved += saved;
    if (!rates) a.unknownModels.add(model);
    byPurpose.set(purpose, a);
  }
  printHeader("Cache analysis");
  const tableRows = [...byPurpose.entries()].map(([purpose, a]) => {
    const total = a.cached + a.cold;
    return {
      purpose,
      cached: a.cached,
      cold: a.cold,
      ratio: fmtPct(a.cached, total),
      tokRatio: ctx.detailed ? fmtPct(a.cachedTokens, a.promptTokens) : undefined,
      saved: fmtUsd(a.saved, 4),
    } as Record<string, Cell>;
  });
  const cols: Col[] = [
    { key: "purpose", label: "purpose" },
    { key: "cached", label: "cached", align: "right" },
    { key: "cold", label: "cold", align: "right" },
    { key: "ratio", label: "hit ratio", align: "right" },
  ];
  if (ctx.detailed) cols.push({ key: "tokRatio", label: "tok ratio", align: "right" });
  cols.push({ key: "saved", label: "saved", align: "right" });
  printTable(cols, tableRows);
  const unknown = new Set<string>();
  for (const a of byPurpose.values()) for (const m of a.unknownModels) unknown.add(m);
  if (unknown.size > 0) {
    console.log(dim(`(savings = 0 for unpriced models: ${[...unknown].join(", ")})`));
  }
}

async function section4PerUnit(ctx: SectionCtx): Promise<void> {
  const extr = await ctx.client.query(
    `SELECT COUNT(*)::int AS calls, COALESCE(SUM(cost_usd_estimated),0)::float AS cost
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
       AND purpose IN ('extraction','extraction-for-person')`,
    [ctx.sinceIso, ctx.purpose],
  );
  const synth = await ctx.client.query(
    `SELECT COUNT(DISTINCT pid)::int AS people,
            COALESCE(SUM(cost_usd_estimated),0)::float AS cost
     FROM (
       SELECT cost_usd_estimated, unnest(NULLIF(person_ids,'{}')) AS pid
       FROM llm_calls
       WHERE created_at >= $1
         AND ($2::text IS NULL OR purpose = $2)
         AND purpose IN ('synthesis-incremental','synthesis-rebuild')
     ) t`,
    [ctx.sinceIso, ctx.purpose],
  );
  const embObs = await ctx.client.query(
    `SELECT COUNT(*)::int AS calls, COALESCE(SUM(cost_usd_estimated),0)::float AS cost
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
       AND purpose = 'embedding-observation'`,
    [ctx.sinceIso, ctx.purpose],
  );
  const e = extr.rows[0] as { calls: number; cost: number };
  const s = synth.rows[0] as { people: number; cost: number };
  const o = embObs.rows[0] as { calls: number; cost: number };
  const eCost = Number(e.cost);
  const sCost = Number(s.cost);
  const oCost = Number(o.cost);
  const perNote = e.calls > 0 ? eCost / e.calls : null;
  const perPerson = s.people > 0 ? sCost / s.people : null;
  const perObs = o.calls > 0 ? oCost / o.calls : null;
  const anyData = perNote != null || perPerson != null || perObs != null;
  if (!anyData) return;
  printHeader("Cost per unit");
  console.log(`Cost per note:                     ${fmtUsd(perNote, 4)}   ${dim(`(${e.calls} call${e.calls === 1 ? "" : "s"})`)}`);
  console.log(`Cost per person synthesized:       ${fmtUsd(perPerson, 4)}   ${dim(`(${s.people} people)`)}`);
  console.log(`Cost per observation embedded:     ${fmtUsd(perObs, 5)}   ${dim(`(${o.calls} call${o.calls === 1 ? "" : "s"})`)}`);
}

async function section5TopExpensive(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       created_at, purpose, model,
       COALESCE(total_tokens,0)::int AS total_tokens,
       cost_usd_estimated::float AS cost,
       duration_ms,
       person_ids,
       metadata
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
     ORDER BY cost_usd_estimated DESC NULLS LAST
     LIMIT 5`,
    [ctx.sinceIso, ctx.purpose],
  );
  if (rows.length === 0) return;
  printHeader("Top 5 expensive calls");
  const tableRows = rows.map((r) => {
    const md = (r.metadata ?? {}) as Record<string, unknown>;
    let context = "";
    if (r.purpose?.startsWith("extraction") && md.note_length != null) {
      context = `note_length=${md.note_length}`;
      if (md.observations_extracted != null) context += ` obs=${md.observations_extracted}`;
    } else if (r.purpose?.startsWith("synthesis")) {
      const pid = Array.isArray(r.person_ids) && r.person_ids.length > 0 ? r.person_ids[0] : null;
      if (pid) context = `person_id=${String(pid).slice(0, 8)}…`;
      if (md.observations_count != null) context += ` obs=${md.observations_count}`;
    } else if (r.purpose?.startsWith("embedding") && md.text_length != null) {
      context = `text_length=${md.text_length}`;
    }
    return {
      timestamp: fmtDate(new Date(r.created_at)),
      purpose: r.purpose,
      model: r.model,
      tokens: fmtTokens(r.total_tokens),
      cost: fmtUsd(Number(r.cost), 4),
      ms: fmtMs(r.duration_ms),
      context,
    };
  });
  printTable(
    [
      { key: "timestamp", label: "timestamp" },
      { key: "purpose", label: "purpose" },
      { key: "model", label: "model" },
      { key: "tokens", label: "tokens", align: "right" },
      { key: "cost", label: "$", align: "right" },
      { key: "ms", label: "ms", align: "right" },
      { key: "context", label: "context" },
    ],
    tableRows,
  );
}

async function section6Errors(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT created_at, purpose, model,
            LEFT(COALESCE(error_message,''), 200) AS error_message
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
       AND success = false
     ORDER BY created_at DESC
     LIMIT 50`,
    [ctx.sinceIso, ctx.purpose],
  );
  if (rows.length === 0) return;
  printHeader(red(`Errors (${rows.length})`));
  printTable(
    [
      { key: "timestamp", label: "timestamp" },
      { key: "purpose", label: "purpose" },
      { key: "model", label: "model" },
      { key: "err", label: "error" },
    ],
    rows.map((r) => ({
      timestamp: fmtDate(new Date(r.created_at)),
      purpose: r.purpose,
      model: r.model,
      err: r.error_message,
    })),
  );
}

// ---------- detailed sections ----------

async function sectionDPerDay(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       date_trunc('day', created_at)::date          AS day,
       COUNT(*)::int                                AS calls,
       COALESCE(SUM(cost_usd_estimated),0)::float   AS cost,
       COALESCE(SUM(cost_usd_estimated) FILTER (WHERE purpose IN ('extraction','extraction-for-person')),0)::float AS cost_extr,
       COALESCE(SUM(cost_usd_estimated) FILTER (WHERE purpose IN ('synthesis-incremental','synthesis-rebuild')),0)::float AS cost_synth,
       COALESCE(SUM(cost_usd_estimated) FILTER (WHERE purpose LIKE 'embedding-%'),0)::float AS cost_embed
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
     GROUP BY day
     ORDER BY day`,
    [ctx.sinceIso, ctx.purpose],
  );
  if (rows.length === 0) return;
  printHeader("Per-day breakdown");
  printTable(
    [
      { key: "day", label: "day" },
      { key: "calls", label: "calls", align: "right" },
      { key: "cost", label: "total $", align: "right" },
      { key: "extr", label: "extr $", align: "right" },
      { key: "synth", label: "synth $", align: "right" },
      { key: "embed", label: "embed $", align: "right" },
    ],
    rows.map((r) => ({
      day: new Date(r.day).toISOString().slice(0, 10),
      calls: r.calls,
      cost: fmtUsd(Number(r.cost), 3),
      extr: fmtUsd(Number(r.cost_extr), 4),
      synth: fmtUsd(Number(r.cost_synth), 4),
      embed: fmtUsd(Number(r.cost_embed), 4),
    })),
  );
}

async function sectionDTokenEfficiency(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT purpose, model,
       COUNT(*)::int AS calls,
       COALESCE(AVG(prompt_tokens),0)::float     AS avg_in,
       COALESCE(AVG(cached_tokens),0)::float     AS avg_cached,
       COALESCE(AVG(completion_tokens),0)::float AS avg_out,
       COALESCE(AVG(cost_usd_estimated),0)::float AS avg_cost
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
     GROUP BY purpose, model
     ORDER BY avg_cost DESC`,
    [ctx.sinceIso, ctx.purpose],
  );
  if (rows.length === 0) return;
  printHeader("Token efficiency");
  printTable(
    [
      { key: "purpose", label: "purpose" },
      { key: "model", label: "model" },
      { key: "calls", label: "calls", align: "right" },
      { key: "avg_in", label: "avg in", align: "right" },
      { key: "avg_cached", label: "avg cached", align: "right" },
      { key: "avg_out", label: "avg out", align: "right" },
      { key: "avg_cost", label: "avg $/call", align: "right" },
    ],
    rows.map((r) => ({
      purpose: r.purpose,
      model: r.model,
      calls: r.calls,
      avg_in: fmtTokens(Number(r.avg_in)),
      avg_cached: fmtTokens(Number(r.avg_cached)),
      avg_out: fmtTokens(Number(r.avg_out)),
      avg_cost: fmtUsd(Number(r.avg_cost), 4),
    })),
  );
}

async function sectionDSlowCalls(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT created_at, purpose, model, duration_ms, total_tokens, cost_usd_estimated::float AS cost
     FROM llm_calls
     WHERE created_at >= $1
       AND ($2::text IS NULL OR purpose = $2)
       AND duration_ms > 5000
     ORDER BY duration_ms DESC
     LIMIT 20`,
    [ctx.sinceIso, ctx.purpose],
  );
  if (rows.length === 0) return;
  printHeader("Slow calls (> 5s)");
  printTable(
    [
      { key: "timestamp", label: "timestamp" },
      { key: "purpose", label: "purpose" },
      { key: "model", label: "model" },
      { key: "ms", label: "duration", align: "right" },
      { key: "tokens", label: "tokens", align: "right" },
      { key: "cost", label: "$", align: "right" },
    ],
    rows.map((r) => ({
      timestamp: fmtDate(new Date(r.created_at)),
      purpose: r.purpose,
      model: r.model,
      ms: fmtMs(r.duration_ms),
      tokens: fmtTokens(r.total_tokens),
      cost: fmtUsd(Number(r.cost), 4),
    })),
  );
}

// ---------- purpose deep-dive ----------

async function sectionPurposeDeepDive(ctx: SectionCtx): Promise<void> {
  if (!ctx.purpose) return;
  if (ctx.purpose === "extraction" || ctx.purpose === "extraction-for-person") {
    await deepDiveExtraction(ctx);
  } else if (ctx.purpose === "synthesis-incremental" || ctx.purpose === "synthesis-rebuild") {
    await deepDiveSynthesis(ctx);
  } else if (ctx.purpose.startsWith("embedding-")) {
    await deepDiveEmbedding(ctx);
  }
}

async function deepDiveExtraction(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       COUNT(*) FILTER (WHERE metadata ? 'note_length')::int       AS calls_with_len,
       COALESCE(AVG((metadata->>'note_length')::int),0)::float     AS avg_note_len,
       COALESCE(MIN((metadata->>'note_length')::int),0)::int       AS min_note_len,
       COALESCE(MAX((metadata->>'note_length')::int),0)::int       AS max_note_len,
       COALESCE(AVG((metadata->>'directory_size')::int),0)::float  AS avg_dir_size
     FROM llm_calls
     WHERE created_at >= $1 AND purpose = $2`,
    [ctx.sinceIso, ctx.purpose],
  );
  const r = rows[0] as Record<string, number | string>;
  if (Number(r.calls_with_len) > 0) {
    printHeader("Extraction — note length");
    console.log(`Calls with note_length:           ${r.calls_with_len}`);
    console.log(`Note length (min / avg / max):    ${r.min_note_len} / ${Math.round(Number(r.avg_note_len))} / ${r.max_note_len}`);
    console.log(`Avg directory size:               ${Math.round(Number(r.avg_dir_size))}`);
  }
  const obsRes = await ctx.client.query(
    `SELECT
       COUNT(*)::int                                                  AS calls,
       COALESCE(AVG((metadata->>'observations_extracted')::int),0)::float AS avg_obs,
       COALESCE(MIN((metadata->>'observations_extracted')::int),0)::int   AS min_obs,
       COALESCE(MAX((metadata->>'observations_extracted')::int),0)::int   AS max_obs,
       COALESCE(SUM((metadata->>'mentions_total')::int),0)::int       AS mentions_total,
       COALESCE(SUM((metadata->>'mentions_ambiguous')::int),0)::int   AS mentions_ambiguous,
       COALESCE(SUM((metadata->>'mentions_unresolved')::int),0)::int  AS mentions_unresolved
     FROM llm_calls
     WHERE created_at >= $1 AND purpose = $2 AND metadata ? 'observations_extracted'`,
    [ctx.sinceIso, ctx.purpose],
  );
  const o = obsRes.rows[0] as Record<string, number | string>;
  if (Number(o.calls) > 0) {
    printHeader("Extraction — output stats");
    console.log(`Calls with output stats:          ${o.calls}`);
    console.log(`Observations/call (min/avg/max):  ${o.min_obs} / ${Number(o.avg_obs).toFixed(1)} / ${o.max_obs}`);
    const mt = Number(o.mentions_total);
    const ma = Number(o.mentions_ambiguous);
    const mu = Number(o.mentions_unresolved);
    const resolved = mt - ma - mu;
    console.log(`Mentions: ${mt} total · ${green(String(resolved))} resolved · ${yellow(String(ma))} ambiguous · ${dim(String(mu))} unidentifiable`);
  } else {
    console.log("");
    console.log(dim("(no calls in window have observations_extracted metadata yet)"));
  }
}

async function deepDiveSynthesis(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       COUNT(*) FILTER (WHERE metadata ? 'observations_count')::int        AS calls,
       COALESCE(AVG((metadata->>'observations_count')::int),0)::float      AS avg_obs_count,
       COALESCE(MIN((metadata->>'observations_count')::int),0)::int        AS min_obs_count,
       COALESCE(MAX((metadata->>'observations_count')::int),0)::int        AS max_obs_count,
       COALESCE(AVG((metadata->>'observations_sent')::int),0)::float       AS avg_obs_sent,
       COUNT(*) FILTER (WHERE metadata->>'had_previous_narrative' = 'true')::int AS with_prev
     FROM llm_calls
     WHERE created_at >= $1 AND purpose = $2`,
    [ctx.sinceIso, ctx.purpose],
  );
  const r = rows[0] as Record<string, number | string>;
  if (Number(r.calls) === 0) return;
  printHeader("Synthesis — input stats");
  console.log(`Calls with stats:                 ${r.calls}`);
  console.log(`Observations counted (min/avg/max): ${r.min_obs_count} / ${Number(r.avg_obs_count).toFixed(1)} / ${r.max_obs_count}`);
  console.log(`Avg observations sent to LLM:     ${Number(r.avg_obs_sent).toFixed(1)}`);
  console.log(`With previous narrative:          ${r.with_prev}`);
}

async function deepDiveEmbedding(ctx: SectionCtx): Promise<void> {
  const { rows } = await ctx.client.query(
    `SELECT
       COUNT(*) FILTER (WHERE metadata ? 'text_length')::int         AS calls,
       COALESCE(AVG((metadata->>'text_length')::int),0)::float       AS avg_len,
       COALESCE(MIN((metadata->>'text_length')::int),0)::int         AS min_len,
       COALESCE(MAX((metadata->>'text_length')::int),0)::int         AS max_len
     FROM llm_calls
     WHERE created_at >= $1 AND purpose = $2`,
    [ctx.sinceIso, ctx.purpose],
  );
  const r = rows[0] as Record<string, number | string>;
  if (Number(r.calls) === 0) return;
  printHeader("Embedding — text length");
  console.log(`Calls with text_length:           ${r.calls}`);
  console.log(`Text length (min / avg / max):    ${r.min_len} / ${Math.round(Number(r.avg_len))} / ${r.max_len}`);
}

// ---------- main ----------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL in .env.local");
    process.exit(1);
  }

  let host = "(unknown)";
  let dbName = "";
  try {
    const u = new URL(dbUrl);
    host = u.host;
    dbName = u.pathname.replace(/^\//, "");
  } catch {
    // ignore parse errors; just print unknown
  }
  console.log(dim(`[i] Reading from ${host}/${dbName}  (read-only — no writes performed)`));

  const sinceMs = Date.now() - args.days * 24 * 3600 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const ctx: SectionCtx = {
      client,
      sinceIso,
      purpose: args.purpose,
      days: args.days,
      detailed: args.detailed,
    };

    const { calls, cost } = await section1Summary(ctx);
    if (calls === 0) {
      const purposeLabel = args.purpose ? ` for purpose=${args.purpose}` : "";
      console.log("");
      console.log(dim(`No llm_calls in the last ${args.days} day${args.days === 1 ? "" : "s"}${purposeLabel}.`));
      return;
    }

    if (!args.purpose) await section2ByPurpose(ctx, cost);
    await section3Cache(ctx);
    await section4PerUnit(ctx);
    await section5TopExpensive(ctx);
    await section6Errors(ctx);

    if (args.detailed) {
      await sectionDPerDay(ctx);
      await sectionDTokenEfficiency(ctx);
      await sectionDSlowCalls(ctx);
    }

    if (args.purpose) await sectionPurposeDeepDive(ctx);

    console.log("");
    console.log(dim(`(window: since ${sinceIso})`));
  } finally {
    await client.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
