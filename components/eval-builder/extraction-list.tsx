"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listExtractionsAction } from "@/app/dev/eval-builder/_actions";
import type { NlExtractionRow } from "@/lib/eval-builder/types";

interface Props {
  initial: NlExtractionRow[];
}

export function ExtractionListClient({ initial }: Props) {
  const [rows, setRows] = useState<NlExtractionRow[]>(initial);
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState<"all" | "applied" | "discarded">("all");
  const [model, setModel] = useState("");
  const [minObs, setMinObs] = useState("");
  const [pending, start] = useTransition();

  const models = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.model);
    return [...s];
  }, [rows]);

  function refilter() {
    start(async () => {
      const next = await listExtractionsAction({
        applied,
        model: model || undefined,
        search: search || undefined,
        minObservations: minObs ? Number(minObs) : undefined,
        limit: 200,
      });
      setRows(next);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded border p-3">
        <div className="flex flex-col">
          <label className="text-[11px] text-muted-foreground">Buscar nota</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-64" />
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-muted-foreground">Estado</label>
          <select
            value={applied}
            onChange={(e) => setApplied(e.target.value as typeof applied)}
            className="h-8 rounded border bg-background px-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="applied">Aplicadas</option>
            <option value="discarded">Descartadas</option>
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-muted-foreground">Modelo</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="h-8 rounded border bg-background px-2 text-sm"
          >
            <option value="">Todos</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] text-muted-foreground">Min obs</label>
          <Input
            value={minObs}
            onChange={(e) => setMinObs(e.target.value)}
            inputMode="numeric"
            className="h-8 w-20"
          />
        </div>
        <Button size="sm" onClick={refilter} disabled={pending}>
          Filtrar
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} extracciones</span>
      </div>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Nota</th>
              <th className="px-3 py-2">Modelo</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Obs</th>
              <th className="px-3 py-2">Pers.</th>
              <th className="px-3 py-2">Warn</th>
              <th className="px-3 py-2">Tokens</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const obs = r.raw_extraction?.observations?.length ?? 0;
              const warn = r.raw_extraction?.warnings?.length ?? 0;
              return (
                <tr key={r.id} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 max-w-[420px]">
                    <div className="line-clamp-2">{r.note_text}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.model}</td>
                  <td className="px-3 py-2 text-xs">{r.extraction_type}</td>
                  <td className="px-3 py-2">
                    {r.applied_at ? (
                      <Badge variant="default">aplicada</Badge>
                    ) : (
                      <Badge variant="subtle">descartada</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{obs}</td>
                  <td className="px-3 py-2">{r.affected_person_ids.length}</td>
                  <td className="px-3 py-2">{warn}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.prompt_tokens ?? "-"}/{r.completion_tokens ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/dev/eval-builder/${r.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Detalle
                    </Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  Sin extracciones para los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
