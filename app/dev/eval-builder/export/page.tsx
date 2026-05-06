import { listEvalCases } from "@/lib/eval-builder/persistence";
import { ExportPanel } from "@/components/eval-builder/export-panel";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const cases = await listEvalCases();
  return <ExportPanel cases={cases} />;
}
