import { NextResponse, type NextRequest } from "next/server";
import {
  processDirtyProfiles,
  synthesizeFullRebuild,
  synthesizeIncremental,
} from "@/lib/profile-synthesis";
import { refreshAllPriors } from "@/lib/person-prior";

/**
 * Profile synthesis job endpoint.
 *
 *   POST /api/jobs/synthesize          (manual / scripts)
 *     Headers: x-job-secret: <JOB_SECRET>
 *     Body: { mode: 'process-dirty', staleSeconds?, batchSize?, throttleMs? }
 *           { mode: 'rebuild', personId, full?: boolean }
 *           { mode: 'refresh-priors' }
 *
 *   GET  /api/jobs/synthesize?mode=...  (schedulers: Vercel Cron / cron-job.org)
 *     Headers: Authorization: Bearer <CRON_SECRET>   (Vercel injects this)
 *              — or — x-job-secret: <JOB_SECRET>      (manual curl)
 *     Query params mirror the POST body. The GET path defaults to a
 *     cron-friendly process-dirty that time-boxes a drain of the dirty queue.
 *
 * Auth is a shared secret — adequate for a single-user tool.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const jobSecret = process.env.JOB_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-job-secret");
  if (jobSecret && provided === jobSecret) return true;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return false;
}

async function runMode(
  mode: string,
  params: {
    staleSeconds?: number;
    batchSize?: number;
    throttleMs?: number;
    personId?: string;
    full?: boolean;
    /** GET-only: time-box a repeated drain of the dirty queue. */
    drainMs?: number;
  },
): Promise<NextResponse> {
  if (mode === "process-dirty") {
    const opts = {
      staleSeconds: params.staleSeconds,
      batchSize: params.batchSize,
      throttleMs: params.throttleMs,
    };
    if (!params.drainMs) {
      const result = await processDirtyProfiles(opts);
      return NextResponse.json({ ok: true, mode, ...result });
    }
    // Drain repeatedly until the queue empties or the time budget runs out.
    // Each synthesized profile is committed before the next, so an early
    // cutoff just leaves the rest dirty for the next run — never corrupt.
    const start = Date.now();
    let processed = 0;
    const errors: Array<{ personId: string; error: string }> = [];
    for (let i = 0; i < 40 && Date.now() - start < params.drainMs; i++) {
      const r = await processDirtyProfiles(opts);
      processed += r.processed;
      errors.push(...r.errors);
      if (r.processed === 0) break;
    }
    return NextResponse.json({ ok: true, mode, processed, errors });
  }
  if (mode === "refresh-priors") {
    const result = await refreshAllPriors();
    return NextResponse.json({ ok: true, mode, ...result });
  }
  if (mode === "rebuild") {
    if (!params.personId) {
      return NextResponse.json({ error: "personId required for mode=rebuild" }, { status: 400 });
    }
    const profile = params.full
      ? await synthesizeFullRebuild(params.personId)
      : await synthesizeIncremental(params.personId);
    return NextResponse.json({ ok: true, mode, personId: params.personId, profile });
  }
  return NextResponse.json({ error: `unknown mode: ${mode}` }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!process.env.JOB_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "JOB_SECRET/CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    body = {};
  }
  const mode = (body.mode as string) ?? "process-dirty";
  try {
    return await runMode(mode, {
      staleSeconds: body.staleSeconds as number | undefined,
      batchSize: body.batchSize as number | undefined,
      throttleMs: body.throttleMs as number | undefined,
      personId: body.personId as string | undefined,
      full: body.full as boolean | undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.JOB_SECRET && !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "JOB_SECRET/CRON_SECRET not configured" }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode") ?? "process-dirty";
  const num = (k: string) => (sp.get(k) != null ? Number(sp.get(k)) : undefined);
  try {
    return await runMode(mode, {
      // Cron-friendly defaults: small batches, no throttle, time-boxed drain
      // so one daily run clears the queue within the function budget.
      staleSeconds: num("staleSeconds") ?? 60,
      batchSize: num("batchSize") ?? 5,
      throttleMs: num("throttleMs") ?? 0,
      drainMs: num("drainMs") ?? 50_000,
      personId: sp.get("personId") ?? undefined,
      full: sp.get("full") === "true",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
