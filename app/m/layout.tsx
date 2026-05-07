import { MobileHeader } from "@/components/mobile/mobile-header";
import { getPendingCount } from "@/lib/mobile-actions";

export const dynamic = "force-dynamic";

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  let count = 0;
  try {
    count = await getPendingCount();
  } catch (e) {
    console.error("MobileLayout: getPendingCount failed", e);
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MobileHeader pendingCount={count} />
      <main className="mx-auto max-w-xl px-4 pb-24 pt-4 text-[15px]">{children}</main>
    </div>
  );
}
