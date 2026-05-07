import { notFound } from "next/navigation";
import { VoiceTestClient } from "./client";

export const dynamic = "force-dynamic";

export default function VoiceTestPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Voice test</h1>
        <p className="text-xs text-muted-foreground">
          Página interna para verificar el componente VoiceInput contra /api/transcribe.
        </p>
      </div>
      <VoiceTestClient />
    </div>
  );
}
