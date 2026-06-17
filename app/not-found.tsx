import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Root 404. Keeps notFound() calls (contact / event detail) and unknown URLs
 * inside the app's visual language instead of the bare Next.js default.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">No encontrado</h1>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Esta página no existe o el elemento que buscabas se movió.
        </p>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
