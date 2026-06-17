"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary. Catches render/data errors in any page so a failed
 * server action surfaces as a calm, branded message inside the shell instead
 * of the raw Next.js error overlay.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Algo se rompió</h1>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          No se pudo cargar esta vista. Puedes reintentar o volver al inicio.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={reset}>
          Reintentar
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/">Inicio</Link>
        </Button>
      </div>
      {error?.digest && <p className="text-[11px] text-muted-foreground">ref: {error.digest}</p>}
    </div>
  );
}
