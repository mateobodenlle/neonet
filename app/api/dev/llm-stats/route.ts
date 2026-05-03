import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * GET /api/dev/llm-stats
 *   Headers: x-job-secret: <JOB_SECRET>
 *
 * Aggregates the llm_calls table over 24h / 7d / 30d windows. Returns:
 *   - by_purpose: per-purpose counts, cost, avg latency, cache ratio
 *   - top_expensive_24h: 10 most expensive single calls in last 24h
 *   - cache_hit_rate_by_model_24h: prompt-cache effectiveness per model
 *
 * Useful to curl from the CLI when checking real cost. Read-only.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CallRow {
  purpose: string;
  model: string;
  prompt_tokens: number | null;
  cached_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  cost_usd_estimated: string | number | null;
  success: boolean;
  created_at: string;
  id: string;
  metadata: Record<string, unknown> | null;
  person_ids: string[] | null;
}

const WINDOWS: Array<{ key: "24h" | "7d" | "30d"; seconds: number }> = [
  { key: "24h", seconds: 24 * 3600 },
  { key: "7d", seconds: 7 * 24 * 3600 },
  { key: "30d", seconds: 30 * 24 * 3600 },
];

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

interface PurposeAgg {
  count: number;
  errors: number;
  total_cost_usd: number;
  duration_sum: number;
  duration_n: number;
  prompt_tokens_sum: number;
  cached_tokens_sum: number;
}

function emptyAgg(): PurposeAgg {
  return {
    count: 0,
    errors: 0,
    total_cost_usd: 0,
    duration_sum: 0,
    duration_n: 0,
    prompt_tokens_sum: 0,
    cached_tokens_sum: 0,
  };
}

function aggregateByPurpose(rows: CallRow[]) {
  const by = new Map<string, PurposeAgg>();
  for (const r of rows) {
    let agg = by.get(r.purpose);
    if (!agg) {
      agg = emptyAgg();
      by.set(r.purpose, agg);
    }
    agg.count++;
    if (!r.success) agg.errors++;
    agg.total_cost_usd += num(r.cost_usd_estimated);
    if (r.duration_ms != null) {
      agg.duration_sum += r.duration_ms;
      agg.duration_n++;
    }
    agg.prompt_tokens_sum += r.prompt_tokens ?? 0;
    agg.cached_tokens_sum += r.cached_tokens ?? 0;
  }
  return Array.from(by.entries()).map(([purpose, a]) => ({
    purpose,
    count: a.count,
    errors: a.errors,
    total_cost_usd: Number(a.total_cost_usd.toFixed(6)),
    avg_duration_ms: a.duration_n ? Math.round(a.duration_sum / a.duration_n) : null,
    cache_ratio:
      a.prompt_tokens_sum > 0
        ? Number((a.cached_tokens_sum / a.prompt_tokens_sum).toFixed(4))
        : null,
  }));
}

function cacheRateByModel(rows: CallRow[]) {
  const by = new Map<string, { prompt: number; cached: number }>();
  for (const r of rows) {
    if (!r.prompt_tokens) continue;
    let m = by.get(r.model);
    if (!m) {
      m = { prompt: 0, cached: 0 };
      by.set(r.model, m);
    }
    m.prompt += r.prompt_tokens;
    m.cached += r.cached_tokens ?? 0;
  }
  return Array.from(by.entries()).map(([model, m]) => ({
    model,
    prompt_tokens: m.prompt,
    cached_tokens: m.cached,
    cache_ratio: m.prompt > 0 ? Number((m.cached / m.prompt).toFixed(4)) : 0,
  }));
}

export async function GET(req: NextRequest) {
  const expected = process.env.JOB_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "JOB_SECRET not configured on server" },
      { status: 500 },
    );
  }
  const provided = req.headers.get("x-job-secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const cutoff30d = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select(
      "id, created_at, purpose, model, prompt_tokens, cached_tokens, completion_tokens, duration_ms, cost_usd_estimated, success, metadata, person_ids",
    )
    .gte("created_at", cutoff30d)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as CallRow[];

  const by_window: Record<string, ReturnType<typeof aggregateByPurpose>> = {};
  for (const w of WINDOWS) {
    const cutoff = new Date(now - w.seconds * 1000).toISOString();
    by_window[w.key] = aggregateByPurpose(rows.filter((r) => r.created_at >= cutoff));
  }

  const cutoff24h = new Date(now - 24 * 3600 * 1000).toISOString();
  const last24h = rows.filter((r) => r.created_at >= cutoff24h);
  const top_expensive_24h = [...last24h]
    .sort((a, b) => num(b.cost_usd_estimated) - num(a.cost_usd_estimated))
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      created_at: r.created_at,
      purpose: r.purpose,
      model: r.model,
      cost_usd_estimated: num(r.cost_usd_estimated),
      duration_ms: r.duration_ms,
      prompt_tokens: r.prompt_tokens,
      cached_tokens: r.cached_tokens,
      completion_tokens: r.completion_tokens,
      person_ids: r.person_ids,
      metadata: r.metadata,
    }));

  return NextResponse.json({
    generated_at: new Date(now).toISOString(),
    rows_scanned: rows.length,
    by_purpose: by_window,
    top_expensive_24h,
    cache_hit_rate_by_model_24h: cacheRateByModel(last24h),
  });
}
