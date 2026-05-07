"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Smartphone } from "lucide-react";

const KEY = "neonet-desktop-banner-dismissed";

// Banner que solo aparece en viewports <640px (sm:hidden) sugiriendo /m.
// CSS-only para evitar parpadeo / hidratación distinta entre SSR y cliente.
export function DesktopBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setDismissed(false);
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  }

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs sm:hidden">
      <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        Estás en la versión web. En móvil prueba{" "}
        <Link href="/m" className="font-medium underline">
          /m
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
