// Pure prior-score math. No "server-only" and no DB — so it can be shared by
// the server module (lib/person-prior.ts) AND the standalone tsx scripts
// (scripts/one-shot/refresh-priors.ts) without either forking the weights.

import type { Closeness } from "./types";

export const CLOSENESS_WEIGHT: Record<Closeness, number> = {
  desconocido: 0,
  conocido: 0.5,
  amigable: 1,
  amigo: 2,
  "amigo-cercano": 3.5,
  "mejor-amigo": 5,
};

/** Recency bonus from days since last observation. */
export function recencyBonus(daysSinceLast: number | null): number {
  if (daysSinceLast === null) return 0;
  if (daysSinceLast <= 7) return 2;
  if (daysSinceLast <= 30) return 1.5;
  if (daysSinceLast <= 90) return 1;
  if (daysSinceLast <= 180) return 0.5;
  return 0;
}

/** Diminishing returns on volume — log keeps a single mega-active contact
 *  from dwarfing every other signal. */
export function volumeBonus(count90d: number): number {
  if (count90d <= 0) return 0;
  return Math.min(2, Math.log2(1 + count90d) * 0.6);
}

export interface PriorInputs {
  closeness: Closeness | null | undefined;
  lastObservationAt: string | null | undefined;
  observationCount90d: number;
}

export function computePrior(inputs: PriorInputs): number {
  const c = (inputs.closeness ?? "desconocido") as Closeness;
  const closenessW = CLOSENESS_WEIGHT[c] ?? 0;
  const days = inputs.lastObservationAt
    ? Math.max(0, (Date.now() - new Date(inputs.lastObservationAt).getTime()) / 86400000)
    : null;
  return Math.round((closenessW + recencyBonus(days) + volumeBonus(inputs.observationCount90d)) * 10) / 10;
}
