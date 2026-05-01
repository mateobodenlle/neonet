import type { Person, SocialHandles } from "./types";

function uniqueStrings(xs: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!x) continue;
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/**
 * Compute the merged Person from `keep` and `drop`. Keep wins on every
 * scalar conflict; multi-value fields (handles, tags, aliases, interests)
 * are unioned. The drop's name is added as an alias when it differs from
 * keep's name. Caller is responsible for using the returned object's id —
 * which equals keep.id — to issue the persistence update.
 */
export function mergePersonFields(keep: Person, drop: Person): Person {
  const handles: SocialHandles = { ...(drop.handles ?? {}), ...(keep.handles ?? {}) };
  const tags = uniqueStrings([...(keep.tags ?? []), ...(drop.tags ?? [])]);
  const aliases = uniqueStrings([
    ...(keep.aliases ?? []),
    ...(drop.aliases ?? []),
    drop.fullName !== keep.fullName ? drop.fullName : null,
  ]);
  const interests = uniqueStrings([...(keep.interests ?? []), ...(drop.interests ?? [])]);

  return {
    ...keep,
    aliases,
    photoUrl: keep.photoUrl ?? drop.photoUrl,
    role: keep.role ?? drop.role,
    company: keep.company ?? drop.company,
    sector: keep.sector ?? drop.sector,
    seniority: keep.seniority ?? drop.seniority,
    location: keep.location ?? drop.location,
    handles: Object.keys(handles).length ? handles : undefined,
    closeness: keep.closeness ?? drop.closeness,
    tags,
    interests,
    affinity: keep.affinity ?? drop.affinity,
    trust: keep.trust ?? drop.trust,
    nextStep: keep.nextStep ?? drop.nextStep,
    updatedAt: new Date().toISOString(),
  };
}
