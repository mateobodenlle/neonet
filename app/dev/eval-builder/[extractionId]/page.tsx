import { notFound } from "next/navigation";
import Link from "next/link";
import { getExtraction, getCorrections } from "@/lib/eval-builder/persistence";
import { ExtractionDetail } from "@/components/eval-builder/extraction-detail";

export const dynamic = "force-dynamic";

export default async function ExtractionDetailPage({
  params,
}: {
  params: Promise<{ extractionId: string }>;
}) {
  const { extractionId } = await params;
  const [extraction, corrections] = await Promise.all([
    getExtraction(extractionId),
    getCorrections(extractionId),
  ]);
  if (!extraction) notFound();
  return (
    <div className="space-y-4">
      <Link href="/dev/eval-builder" className="text-sm text-muted-foreground hover:underline">
        ← Volver
      </Link>
      <ExtractionDetail extraction={extraction} corrections={corrections} />
    </div>
  );
}
