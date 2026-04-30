import "server-only";

/**
 * Person prior score: a numeric signal used during NL extraction to bias
 * mention disambiguation toward likely-relevant contacts.
 *
 * Composite of three signals:
 *   - closeness ladder (atemporal personal closeness)
 *   - recency of the last observation
 *   - rolling 90-day participation count
 *
 * The score range is roughly [0, 8]. The extractor's prompt uses cutoffs
 * (≥ 3 = strong, ≥ 1 = present, < 1 = weak); the exact numbers are
 * iterated against the eval set, not env-tunable.
 *
 * Future: learn weights from the user's accept/reject behaviour on
 * disambiguation prompts.
 */

import { supabaseAdmin } from "./supabase-admin";
import type { Closeness } from "./types";

// ---- weights -----------------------------------------------------------

const CLOSENESS_WEIGHT: Record<Closeness, number> = {
  desconocido: 0,
  conocido: 0.5,
  amigable: 1,
  amigo: 2,
  "amigo-cercano": 3.5,
  "mejor-amigo": 5,
};

/** Recency bonus from days since last observation. */
function recencyBonus(daysSinceLast: number | null): number {
  if (daysSinceLast === null) return 0;
  if (daysSinceLast <= 7) return 2;
  if (daysSinceLast <= 30) return 1.5;
  if (daysSinceLast <= 90) return 1;
  if (daysSinceLast <= 180) return 0.5;
  return 0;
}

/** Diminishing returns on volume — log keeps a single mega-active contact
 *  from dwarfing every other signal. */
function volumeBonus(count90d: number): number {
  if (count90d <= 0) return 0;
  return Math.min(2, Math.log2(1 + count90d) * 0.6);
}

// ---- pure compute ------------------------------------------------------

export interface PriorInputs {
  closeness: Closeness | null | undefined;
  lastObservationAt: string | null | undefined;
  observationCount90d: number;
}

export function computePrior(inputs: PriorInputs): number {
  const c = (inputs.closeness ?? "desconocido") as Closeness;
  const closenessW = CLOSENESS_WEIGHT[c] ?? 0;
  const days =
    inputs.lastObservationAt
      ? Math.max(
          0,
          (Date.now() - new Date(inputs.lastObservationAt).getTime()) / 86400000
        )
      : null;
  const recency = recencyBonus(days);
  const volume = volumeBonus(inputs.observationCount90d);
  const total = closenessW + recency + volume;
  return Math.round(total * 10) / 10;
}

// ---- DB-backed refresh -------------------------------------------------

interface PersonStats {
  lastObservationAt: string | null;
  observationCount90d: number;
}

async function statsForPerson(personId: string): Promise<PersonStats> {
  // last_observation_at: max observed_at among non-superseded observations
  // the person participates in.
  const { data: lastRow, error: lastErr } = await supabaseAdmin
    .from("observation_participants")
    .select("observations!inner(observed_at, superseded_by)")
    .eq("person_id", personId)
    .is("observations.superseded_by", null)
    .order("observations(observed_at)", { ascending: false })
    .limit(1);
  if (lastErr) throw lastErr;
  const obsField = (lastRow?.[0] as { observations?: unknown } | undefined)?.observations;
  // Supabase returns the joined row as an object for ".inner" joins, but
  // typing flips to array under some configurations. Normalise.
  const obsObj = Array.isArray(obsField) ? obsField[0] : obsField;
  const lastObservationAt =
    (obsObj as { observed_at?: string } | undefined)?.observed_at ?? null;

  // 90-day count.
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { count, error: countErr } = await supabaseAdmin
    .from("observation_participants")
    .select("observations!inner(observed_at, superseded_by)", {
      count: "exact",
      head: true,
    })
    .eq("person_id", personId)
    .gte("observations.observed_at", cutoff)
    .is("observations.superseded_by", null);
  if (countErr) throw countErr;

  return {
    lastObservationAt: lastObservationAt
      ? new Date(`${lastObservationAt}T00:00:00Z`).toISOString()
      : null,
    observationCount90d: count ?? 0,
  };
}

export async function refreshPriorsForPerson(personId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("closeness")
    .eq("id", personId)
    .single();
  if (error || !data) return;
  const stats = await statsForPerson(personId);
  const prior = computePrior({
    closeness: (data.closeness ?? null) as Closeness | null,
    lastObservationAt: stats.lastObservationAt,
    observationCount90d: stats.observationCount90d,
  });
  const { error: ue } = await supabaseAdmin
    .from("people")
    .update({
      prior_score: prior,
      last_observation_at: stats.lastObservationAt,
      observation_count_90d: stats.observationCount90d,
    })
    .eq("id", personId);
  if (ue) throw ue;
}

export async function refreshPriorsForPersons(personIds: string[]): Promise<void> {
  const unique = [...new Set(personIds)];
  for (const id of unique) {
    try {
      await refreshPriorsForPerson(id);
    } catch (e) {
      console.error(`refreshPriorsForPerson(${id}) failed:`, e);
    }
  }
}

/**
 * Full recompute for every non-archived person. Idempotent. Run periodically
 * to absorb 90-day window drift even when no new observations land.
 */
export async function refreshAllPriors(): Promise<{ processed: number }> {
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("id")
    .eq("archived", false);
  if (error) throw error;
  let processed = 0;
  for (const r of data ?? []) {
    try {
      await refreshPriorsForPerson(r.id);
      processed++;
    } catch (e) {
      console.error(`refreshPriors ${r.id}:`, e);
    }
  }
  return { processed };
}
