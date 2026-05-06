import { listExtractions } from "@/lib/eval-builder/persistence";
import { ExtractionListClient } from "@/components/eval-builder/extraction-list";

export const dynamic = "force-dynamic";

export default async function EvalBuilderListPage() {
  const initial = await listExtractions({ limit: 200 });
  return <ExtractionListClient initial={initial} />;
}
