import Link from "next/link";
import { notFound } from "next/navigation";
import { getExtractionById } from "@/lib/repository";
import { loadPeopleByIds, searchDirectory, loadObservationSnippets } from "@/lib/mobile-actions";
import { collectCandidateIds } from "@/lib/extraction-plan";
import { ExtractionReview } from "@/components/mobile/extraction-review";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: PageProps) {
  const { id } = await params;
  const row = await getExtractionById(id);
  if (!row) notFound();
  if (row.applied_at) {
    const isDiscarded =
      row.applied_plan &&
      typeof row.applied_plan === "object" &&
      "discarded" in row.applied_plan &&
      (row.applied_plan as { discarded?: unknown }).discarded === true;
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight">Nota ya resuelta</h1>
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isDiscarded ? "Descartada" : "Aplicada"}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[14px]">{row.note_text}</p>
        </div>
        <Link
          href="/m/pending"
          className="inline-block text-sm text-accent underline-offset-4 hover:underline"
        >
          ← Volver a pendientes
        </Link>
      </div>
    );
  }

  const candidateIds = collectCandidateIds(row.raw_extraction);
  const people = await loadPeopleByIds(candidateIds);

  return (
    <ExtractionReview
      extractionId={row.id}
      noteText={row.note_text}
      extraction={row.raw_extraction}
      people={people}
      searchPeople={searchDirectory}
      fetchSnippets={loadObservationSnippets}
    />
  );
}
