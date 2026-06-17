import { headers } from "next/headers";
import { DemoHeader } from "@/components/demo/demo-header";
import { DemoSidebar } from "@/components/demo/demo-sidebar";
import { DemoNLDialog } from "@/components/demo/demo-nl-dialog";
import { getPendingCountDemo } from "@/lib/demo/actions";

export const dynamic = "force-dynamic";

export default async function DemoLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMobile = pathname === "/demo/m" || pathname.startsWith("/demo/m/");

  let count = 0;
  try {
    count = await getPendingCountDemo();
  } catch {
    /* sin sesión / TTL: 0 */
  }

  const banner = (
    <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-[12px] text-warning">
      Modo demo — los cambios no se guardan. Datos ficticios, extracción con OpenAI real.
    </div>
  );

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <DemoHeader pendingCount={count} variant="mobile" />
        {banner}
        <main className="mx-auto max-w-xl px-4 pb-24 pt-4 text-[15px]">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <DemoSidebar pendingCount={count} />
      <div className="flex min-w-0 flex-1 flex-col">
        {banner}
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-10 py-10">{children}</main>
      </div>
      <DemoNLDialog />
    </div>
  );
}
