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

export function parseFacets(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
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
