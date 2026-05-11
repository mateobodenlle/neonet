"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  pendingCount: number;
  /** "mobile" → header móvil; "desktop" no se usa (lo cubre la sidebar). */
  variant?: "mobile";
}

export function DemoHeader({ pendingCount }: Props) {
  const router = useRouter();

  async function exitDemo() {
    await fetch("/api/demo/exit", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/demo/m" className="text-base font-semibold tracking-tight">
        Neonet{" "}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">demo</span>
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/demo/m/pending"
          aria-label={`Pendientes (${pendingCount})`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Inbox className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-accent-foreground">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Link>
        <Button size="sm" variant="ghost" onClick={exitDemo} aria-label="Salir de la demo">
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </Button>
      </div>
    </header>
  );
}
