import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/toaster";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Agenda2",
  description: "CRM personal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn(GeistSans.variable, GeistMono.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-[14px] text-foreground antialiased">
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="flex-1 min-w-0">
            <div className="mx-auto max-w-[1240px] px-10 py-10">{children}</div>
          </main>
        </div>
        <CommandPalette />
        <Toaster />
      </body>
    </html>
  );
}
