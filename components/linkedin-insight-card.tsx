"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Linkedin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateLinkedinInsightAction } from "@/lib/linkedin-insight-actions";
import type { InsightOutcome } from "@/lib/linkedin-insight";

interface Props {
  personId: string;
  hasLinkedin: boolean;
}

export function LinkedinInsightCard({ personId, hasLinkedin }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<InsightOutcome | null>(null);

  if (!hasLinkedin) return null;

  async function run() {
    setRunning(true);
    try {
      const r = await generateLinkedinInsightAction(personId);
      setResult(r);
      if (r.sufficient) {
        toast.success(`Insight generado · ${r.observationsCreated} observaciones`);
      } else {
        toast.message(r.reason ?? "Sin contenido suficiente");
      }
    } catch (e) {
      toast.error("Error al generar insight", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Linkedin className="h-3.5 w-3.5" />
          Insight desde LinkedIn
        </CardTitle>
        <Button size="sm" variant="outline" onClick={run} disabled={running}>
          <Sparkles className="h-3.5 w-3.5" />
          {running ? "Analizando…" : result ? "Regenerar" : "Generar insight"}
        </Button>
      </CardHeader>
      {result && (
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <Stat label="Mensajes usados" value={result.messagesUsed.toString()} />
            <Stat label="Comentarios" value={result.commentsUsed.toString()} />
            <Stat label="Caracteres" value={result.totalChars.toString()} />
          </div>
          {result.sufficient ? (
            <>
              {result.narrative && (
                <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-[13px] leading-relaxed">
                  {result.narrative}
                </div>
              )}
              <div className="text-[12px] text-muted-foreground">
                Se han creado <strong>{result.observationsCreated}</strong> observaciones (visibles
                en el bloque de Observaciones de arriba). El perfil se sintetizará en la próxima
                pasada.
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-secondary/20 px-3 py-2 text-[13px] text-muted-foreground">
              {result.reason ?? "Sin contenido suficiente."}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[13px] font-medium">{value}</div>
    </div>
  );
}
