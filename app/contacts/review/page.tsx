import { listPendingCandidates, getCandidateStats } from "@/lib/candidate-actions";
import { ReviewDeck, NoCandidatesEmptyState } from "@/components/review-deck";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [candidates, stats] = await Promise.all([
    listPendingCandidates(),
    getCandidateStats(),
  ]);

  const totalReviewed = stats.accepted + stats.rejected + stats.merged;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Revisar conexiones</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Decide si subir cada conexión de LinkedIn como contacto, descartarla o fusionarla con
          uno existente. {totalReviewed > 0 && `Llevas ${totalReviewed} clasificadas.`}
        </p>
      </header>

      {candidates.length === 0 && stats.pending === 0 && totalReviewed === 0 ? (
        <NoCandidatesEmptyState />
      ) : (
        <ReviewDeck initialCandidates={candidates} initialStats={stats} />
      )}
    </div>
  );
}
