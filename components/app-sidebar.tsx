"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Users, CalendarDays, Share2, Search, User } from "lucide-react";

const nav = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/contacts", label: "Contactos", icon: Users },
  { href: "/events", label: "Eventos", icon: CalendarDays },
  { href: "/graph", label: "Grafo", icon: Share2 },
  { href: "/me", label: "Sobre mí", icon: User },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-background">
      <div className="px-5 pt-6 pb-2">
        <div className="text-[15px] font-semibold tracking-tight">Agenda</div>
      </div>

      <button
        onClick={() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
        }}
        className="mx-3 mb-3 mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary/60"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Buscar</span>
        <kbd className="rounded border border-border bg-secondary px-1 text-[10px]">⌘K</kbd>
      </button>

      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border px-5 py-4 text-xs text-muted-foreground">
        osixtechteam@gmail.com
      </div>
    </aside>
  );
}
