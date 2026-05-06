import { notFound } from "next/navigation";
import Link from "next/link";
import { getExtraction } from "@/lib/eval-builder/persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PromoteForm } from "@/components/eval-builder/invariant-form";

export const dynamic = "force-dynamic";

export default async function PromotePage({
  params,
}: {
  params: Promise<{ extractionId: string }>;
}) {
  const { extractionId } = await params;
  const extraction = await getExtraction(extractionId);
  if (!extraction) notFound();

  const { data: people } = await supabaseAdmin
    .from("people")
    .select("id, full_name, company")
    .eq("archived", false)
    .order("full_name");

  const { data: meRow } = await supabaseAdmin
    .from("me_profile")
    .select("linked_person_id")
    .maybeSingle();
  const ownerPersonId = (meRow?.linked_person_id as string | null) ?? null;

  return (
    <div className="space-y-4">
      <Link
        href={`/dev/eval-builder/${extraction.id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Volver al detalle
      </Link>
      <h2 className="text-lg font-semibold">Promover a caso de eval</h2>
      <PromoteForm
        extraction={extraction}
        people={(people ?? []) as Array<{ id: string; full_name: string; company: string | null }>}
        ownerPersonId={ownerPersonId}
      />
    </div>
  );
}
