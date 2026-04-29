"use client";

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

/**
 * Loads the database from Supabase on mount and gates child rendering until
 * hydration completes. Avoids the empty-state flash that would happen if
 * children rendered before the first hydrate() resolved.
 */
export function HydrationGate({ children }: Props) {
  const hydrated = useStore((s) => s.hydrated);
  const hydrating = useStore((s) => s.hydrating);
  const hydrate = useStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated && !hydrating) hydrate();
  }, [hydrated, hydrating, hydrate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <div className="text-[13px]">Cargando datos...</div>
      </div>
    );
  }
  return <>{children}</>;
}
