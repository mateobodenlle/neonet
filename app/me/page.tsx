import Link from "next/link";
import { getMeProfileFull } from "@/lib/me-profile-actions";
import { MeProfileView } from "@/components/me-profile-view";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await getMeProfileFull();
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Sobre mí</h1>
        <Card>
          <CardContent className="py-10 text-center text-[13px] text-muted-foreground">
            Aún no has importado tus datos. Corre{" "}
            <code className="rounded bg-secondary px-1">npm run import:linkedin-self -- &lt;dir&gt; --commit</code>{" "}
            con el directorio del export de LinkedIn para llenar esta página.
          </CardContent>
        </Card>
        <p className="text-[12px] text-muted-foreground">
          <Link href="/contacts" className="hover:text-foreground">
            ← Volver a contactos
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <MeProfileView initial={profile} />
    </div>
  );
}
