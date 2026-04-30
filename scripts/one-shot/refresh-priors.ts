/**
 * One-shot: recompute prior_score / last_observation_at /
 * observation_count_90d for every non-archived person. Equivalent to
 * `POST /api/jobs/synthesize {mode:'refresh-priors'}` but doesn't need a
 * running dev server.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const CLOSENESS_WEIGHT: Record<string, number> = {
  desconocido: 0,
  conocido: 0.5,
  amigable: 1,
  amigo: 2,
  "amigo-cercano": 3.5,
  "mejor-amigo": 5,
};

function recencyBonus(daysSinceLast: number | null): number {
  if (daysSinceLast === null) return 0;
  if (daysSinceLast <= 7) return 2;
  if (daysSinceLast <= 30) return 1.5;
  if (daysSinceLast <= 90) return 1;
  if (daysSinceLast <= 180) return 0.5;
  return 0;
}

function volumeBonus(count90d: number): number {
  if (count90d <= 0) return 0;
  return Math.min(2, Math.log2(1 + count90d) * 0.6);
}

async function main() {
  const { data: people, error } = await supa
    .from("people")
    .select("id, closeness")
    .eq("archived", false);
  if (error) throw error;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  let processed = 0;
  for (const p of people ?? []) {
    // last observation
    const { data: lastRows } = await supa
      .from("observation_participants")
      .select("observations!inner(observed_at, superseded_by)")
      .eq("person_id", p.id)
      .is("observations.superseded_by", null)
      .order("observations(observed_at)", { ascending: false })
      .limit(1);
    const obsField = (lastRows?.[0] as { observations?: unknown } | undefined)?.observations;
    const obsObj = Array.isArray(obsField) ? obsField[0] : obsField;
    const lastObservationDate = (obsObj as { observed_at?: string } | undefined)?.observed_at ?? null;
    const lastObservationAt = lastObservationDate
      ? new Date(`${lastObservationDate}T00:00:00Z`).toISOString()
      : null;

    // 90d count
    const { count } = await supa
      .from("observation_participants")
      .select("observations!inner(observed_at, superseded_by)", { count: "exact", head: true })
      .eq("person_id", p.id)
      .gte("observations.observed_at", cutoff)
      .is("observations.superseded_by", null);

    const days =
      lastObservationAt
        ? Math.max(0, (Date.now() - new Date(lastObservationAt).getTime()) / 86400000)
        : null;
    const closenessW = CLOSENESS_WEIGHT[p.closeness ?? "desconocido"] ?? 0;
    const total =
      Math.round((closenessW + recencyBonus(days) + volumeBonus(count ?? 0)) * 10) / 10;

    await supa
      .from("people")
      .update({
        prior_score: total,
        last_observation_at: lastObservationAt,
        observation_count_90d: count ?? 0,
      })
      .eq("id", p.id);
    processed++;
    if (processed % 50 === 0) process.stdout.write(`  ${processed}/${(people ?? []).length}…\r`);
  }
  process.stdout.write(`\nRefreshed priors for ${processed} people.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
