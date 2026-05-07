import { getPendingExtractions } from "@/lib/repository";
import { PendingList } from "@/components/mobile/pending-list";

export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const items = await getPendingExtractions({ limit: 100 });
  // Serializamos lo mínimo que la UI necesita (evita pasar todo el raw_extraction).
  const summary = items.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    note_text: row.note_text,
    observations_count: row.raw_extraction?.observations?.length ?? 0,
    mention_texts: collectMentionTexts(row.raw_extraction),
  }));
  return <PendingList items={summary} />;
}

function collectMentionTexts(raw: { observations?: Array<{ primary_mention?: { text?: string } }> } | null): string[] {
  const set = new Set<string>();
  for (const o of raw?.observations ?? []) {
    const t = o.primary_mention?.text;
    if (t) set.add(t);
  }
  return [...set];
}
