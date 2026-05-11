"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Home, Users, Share2, Smartphone, Inbox, LogOut, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/demo", label: "Inicio", icon: Home },
  { href: "/demo/contacts", label: "Contactos", icon: Users },
  { href: "/demo/graph", label: "Grafo", icon: Share2 },
  { href: "/demo/m", label: "Móvil", icon: Smartphone },
];

interface Props {
  pendingCount: number;
}

export function DemoSidebar({ pendingCount }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function exitDemo() {
    await fetch("/api/demo/exit", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  function openNL() {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "J", metaKey: true, shiftKey: true }));
  }

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-5 pt-6 pb-2">
        <div className="text-[15px] font-semibold tracking-tight">
          Neonet{" "}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">demo</span>
        </div>
      </div>

      <button
        onClick={openNL}
        className="mx-3 mb-3 mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary/60"
      >
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span className="flex-1 text-left">Nota rápida</span>
        <kbd className="rounded border border-border bg-secondary px-1 text-[10px]">⌘⇧J</kbd>
      </button>

      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/demo"
              ? pathname === "/demo"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}

        <Link
          href="/demo/m/pending"
          className={cn(
            "mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
            pathname.startsWith("/demo/m/pending")
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <Inbox className="h-4 w-4" />
          Pendientes
          {pendingCount > 0 && (
            <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-accent-foreground">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </Link>
      </nav>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-5 py-4 text-xs text-muted-foreground">
        <span className="truncate">Sesión demo</span>
        <Button size="sm" variant="ghost" onClick={exitDemo}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </aside>
  );
}
