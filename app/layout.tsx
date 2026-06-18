import type { Metadata } from "next";
import { headers } from "next/headers";
import dynamic from "next/dynamic";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

// Desktop-only client modules. Importarlos con next/dynamic los saca del
// chunk del layout, así /m y /login no descargan zustand, cmdk, Radix
// Dialog/Popover ni nl-actions-v2 (todos arrastrados por estos cuatro).
const AppSidebar = dynamic(() =>
  import("@/components/app-sidebar").then((m) => m.AppSidebar),
);
const CommandPalette = dynamic(() =>
  import("@/components/command-palette").then((m) => m.CommandPalette),
);
const HydrationGate = dynamic(() =>
  import("@/components/hydration-gate").then((m) => m.HydrationGate),
);
const NLInputDialog = dynamic(() =>
  import("@/components/nl-input-dialog").then((m) => m.NLInputDialog),
);

export const metadata: Metadata = {
  title: "Neonet",
  description: "CRM personal",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isMobileRoute = pathname.startsWith("/m");
  const isDemoRoute = pathname === "/demo" || pathname.startsWith("/demo/");
  const isAuthPage = pathname === "/login";
  const showDesktopShell = !isMobileRoute && !isDemoRoute && !isAuthPage;

  return (
    <html lang="es" className={cn(GeistSans.variable, GeistMono.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-[14px] text-foreground antialiased">
        {showDesktopShell ? (
          <>
            <div className="flex min-h-screen">
              <AppSidebar />
              <main className="flex-1 min-w-0">
                <div className="mx-auto max-w-[1240px] px-10 py-10">
                  <HydrationGate>{children}</HydrationGate>
                </div>
              </main>
            </div>
            <CommandPalette />
            <NLInputDialog />
          </>
        ) : (
          children
        )}
        <Toaster />
      </body>
    </html>
  );
}
