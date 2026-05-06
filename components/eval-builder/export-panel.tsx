"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportEvalCasesAction } from "@/app/dev/eval-builder/_actions";
import type { EvalCaseRow } from "@/lib/eval-builder/types";

export function ExportPanel({ cases }: { cases: EvalCaseRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(cases.map((c) => c.id)));
  const [pending, start] = useTransition();
  const [output, setOutput] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onExport() {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Selecciona al menos un caso");
      return;
    }
    start(async () => {
      try {
        const jsonl = await exportEvalCasesAction(ids);
        setOutput(jsonl);
        const blob = new Blob([jsonl], { type: "application/x-ndjson" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "extraction-cases.jsonl";
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exportados ${ids.length} casos`);
      } catch (e) {
        toast.error("Error exportando", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{cases.length} casos guardados</p>
        <Button onClick={onExport} disabled={pending}>
          Exportar seleccionados ({selected.size})
        </Button>
      </div>
      <div className="rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2">Creado</th>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">Prioridad</th>
              <th className="px-3 py-2">Exportado</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(c.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{c.id.slice(0, 8)}…</td>
                <td className="px-3 py-2">
                  {c.tags.map((t) => (
                    <Badge key={t} variant="subtle" className="mr-1">
                      {t}
                    </Badge>
                  ))}
                </td>
                <td className="px-3 py-2">{c.priority}</td>
                <td className="px-3 py-2 text-xs">
                  {c.exported_at ? new Date(c.exported_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Sin casos guardados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {output && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Pega esto manualmente en <code>data/eval/extraction-cases.jsonl</code> si no
            usaste la descarga:
          </p>
          <textarea
            readOnly
            value={output}
            className="w-full min-h-[160px] rounded border bg-muted/20 p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
