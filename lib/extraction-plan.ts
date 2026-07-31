// Helpers puros que comparten el flujo de extracción NL desktop y móvil.
// Sin "use server" ni "server-only": importables desde ambos lados.

import type {
  ExtractionV2,
  MentionResolution,
  PersonMention,
} from "./nl-types";

export function collectMentions(extraction: ExtractionV2): PersonMention[] {
  const byText = new Map<string, PersonMention>();
  const add = (m: PersonMention) => {
    if (!byText.has(m.text)) byText.set(m.text, m);
  };
  for (const o of extraction.observations ?? []) {
    add(o.primary_mention);
    for (const p of o.participants ?? []) add(p.mention);
  }
  for (const u of extraction.person_updates ?? []) add(u.primary_mention);
  return [...byText.values()];
}

export function defaultResolution(m: PersonMention): MentionResolution {
  if (m.candidate_ids.length > 0) return { kind: "existing", personId: m.candidate_ids[0] };
  if (m.proposed_new) return { kind: "new", person: m.proposed_new };
  return { kind: "skip" };
}

// Some models copy directory ids truncated (e.g. an 8-char uuid prefix).
// Expand any id that uniquely prefixes a known id so the preview and apply
// can resolve it; unknown ids are left as-is and dropped downstream.
function makeIdExpander(known: string[]): (id: string) => string {
  const exact = new Set(known);
  return (id) => {
    if (exact.has(id) || id.length < 6) return id;
    const hits = known.filter((k) => k.startsWith(id));
    return hits.length === 1 ? hits[0] : id;
  };
}

export function expandTruncatedIds(
  extraction: ExtractionV2,
  personIds: string[],
  observationIds: string[]
): void {
  const person = makeIdExpander(personIds);
  const obs = makeIdExpander(observationIds);
  const fixMention = (m: PersonMention | null | undefined) => {
    if (m?.candidate_ids?.length) m.candidate_ids = m.candidate_ids.map(person);
  };
  for (const o of extraction.observations ?? []) {
    fixMention(o.primary_mention);
    for (const p of o.participants ?? []) fixMention(p.mention);
    const hint = o.supersedes_hint;
    if (hint?.candidate_observation_ids?.length) {
      hint.candidate_observation_ids = hint.candidate_observation_ids.map(obs);
    }
  }
  for (const u of extraction.person_updates ?? []) fixMention(u.primary_mention);
}

export function parseFacets(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Participant roles are stored as raw enum tokens (co_subject, promise_target…)
// but should never reach the UI like that. One source of truth for both the
// desktop preview and the mobile review.
const ROLE_LABELS: Record<string, string> = {
  primary: "principal",
  co_subject: "co-sujeto",
  related: "relacionado",
  source: "fuente",
  mentioned: "mencionado",
  promise_target: "destinatario",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

/** Facet key/value pairs (excluding the `type` discriminator) as readable
 *  strings, so the preview can render chips instead of dumping raw JSON. */
export function facetChips(facets: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(facets)
    .filter(([k]) => k !== "type")
    .map(([key, v]) => ({
      key,
      value: typeof v === "object" && v !== null ? JSON.stringify(v) : String(v),
    }));
}

/** Every observation id referenced by a supersedes_hint, so a caller can
 *  fetch their content for a meaningful "you're replacing this" preview. */
export function collectSupersedeHintIds(extraction: ExtractionV2): string[] {
  const ids = new Set<string>();
  for (const o of extraction.observations ?? []) {
    for (const id of o.supersedes_hint?.candidate_observation_ids ?? []) ids.add(id);
  }
  return [...ids];
}

export function collectCandidateIds(raw: ExtractionV2): string[] {
  const ids = new Set<string>();
  const visit = (m: PersonMention) => m.candidate_ids?.forEach((id) => ids.add(id));
  for (const o of raw.observations ?? []) {
    visit(o.primary_mention);
    for (const p of o.participants ?? []) visit(p.mention);
  }
  for (const u of raw.person_updates ?? []) visit(u.primary_mention);
  return [...ids];
}
