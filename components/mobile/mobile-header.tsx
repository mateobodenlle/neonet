"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

interface Props {
  pendingCount: number;
}

export function MobileHeader({ pendingCount }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link href="/m" className="text-base font-semibold tracking-tight">
        Neonet
      </Link>
      <div className="flex items-center gap-2">
        <Link
          href="/m/pending"
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
        <LogoutButton />
      </div>
    </header>
  );
}
