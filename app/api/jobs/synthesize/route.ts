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
 *   POST /api/jobs/synthesize
 *     Headers: x-job-secret: <JOB_SECRET>
 *     Body (optional):
 *       { mode: 'process-dirty', staleSeconds?, batchSize?, throttleMs? }
 *       { mode: 'rebuild', personId, full?: boolean }
 *
 * Default mode is 'process-dirty' with built-in defaults.
 *
 * Auth is a shared secret in env (JOB_SECRET). Adequate for a single-user
 * tool — replace when multi-tenancy lands.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.JOB_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "JOB_SECRET not configured on server" },
      { status: 500 }
    );
  }
  const provided = req.headers.get("x-job-secret");
  if (provided !== expected) {
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
    if (mode === "process-dirty") {
      const result = await processDirtyProfiles({
        staleSeconds: body.staleSeconds as number | undefined,
        batchSize: body.batchSize as number | undefined,
        throttleMs: body.throttleMs as number | undefined,
      });
      return NextResponse.json({ ok: true, mode, ...result });
    }
    if (mode === "refresh-priors") {
      const result = await refreshAllPriors();
      return NextResponse.json({ ok: true, mode, ...result });
    }
    if (mode === "rebuild") {
      const personId = body.personId as string;
      if (!personId) {
        return NextResponse.json(
          { error: "personId required for mode=rebuild" },
          { status: 400 }
        );
      }
      const profile = body.full
        ? await synthesizeFullRebuild(personId)
        : await synthesizeIncremental(personId);
      return NextResponse.json({ ok: true, mode, personId, profile });
    }
    return NextResponse.json({ error: `unknown mode: ${mode}` }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
