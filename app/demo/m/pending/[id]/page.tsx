import Link from "next/link";
import { notFound } from "next/navigation";
import { ExtractionReview } from "@/components/mobile/extraction-review";
import {
  applyExtractionDemo,
  discardExtractionDemo,
  getExtractionByIdDemo,
} from "@/lib/demo/actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoReviewPage({ params }: PageProps) {
  const { id } = await params;
  const row = await getExtractionByIdDemo(id);
  if (!row) notFound();
  if (row.status !== "pending") {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold tracking-tight">Nota ya resuelta</h1>
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {row.status === "discarded" ? "Descartada" : "Aplicada"}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[14px]">{row.note_text}</p>
        </div>
        <Link
          href="/demo/m/pending"
          className="inline-block text-sm text-accent underline-offset-4 hover:underline"
        >
          ← Volver a pendientes
        </Link>
      </div>
    );
  }
  return (
    <ExtractionReview
      extractionId={row.id}
      noteText={row.note_text}
      extraction={row.raw_extraction}
      people={row.people}
      applyAction={applyExtractionDemo}
      discardAction={discardExtractionDemo}
      pendingHref="/demo/m/pending"
    />
  );
}
