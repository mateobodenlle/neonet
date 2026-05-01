"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { mergePersonFields } from "@/lib/merge-people";
import { PersonAvatar } from "@/components/person-avatar";
import type { Person } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: [Person, Person] | null;
  onMerged?: () => void;
}

export function MergeContactsDialog({ open, onOpenChange, people, onMerged }: Props) {
  const mergePeople = useStore((s) => s.mergePeople);
  const [keepId, setKeepId] = useState<string | null>(null);

  const initialKeepId = people?.[0]?.id ?? null;
  const effectiveKeepId = keepId ?? initialKeepId;

  const ordered = useMemo(() => {
    if (!people || !effectiveKeepId) return null;
    const keep = people.find((p) => p.id === effectiveKeepId)!;
    const drop = people.find((p) => p.id !== effectiveKeepId)!;
    return { keep, drop };
  }, [people, effectiveKeepId]);

  const preview = useMemo(() => {
    if (!ordered) return null;
    return mergePersonFields(ordered.keep, ordered.drop);
  }, [ordered]);

  function handleConfirm() {
    if (!ordered) return;
    const merged = mergePeople(ordered.keep.id, ordered.drop.id);
    if (!merged) {
      toast.error("No se pudo combinar");
      return;
    }
    toast.success(`Combinado en ${merged.fullName}`);
    setKeepId(null);
    onMerged?.();
    onOpenChange(false);
  }

  function handleOpenChange(v: boolean) {
    if (!v) setKeepId(null);
    onOpenChange(v);
  }

  if (!people || !ordered || !preview) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Combinar contactos</DialogTitle>
          <DialogDescription>
            Elige cuál conservar. El otro se elimina y sus encuentros, interacciones,
            observaciones y conexiones se reasignan al conservado. Esta acción no se puede
            deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {people.map((p) => {
            const isKeep = p.id === effectiveKeepId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setKeepId(p.id)}
                className={`flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition ${
                  isKeep
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-secondary/40"
                }`}
              >
                <div className="flex w-full items-center gap-2">
                  <PersonAvatar person={p} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{p.fullName}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {p.role || p.company || "—"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                      isKeep
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {isKeep ? "Conservar" : "Descartar"}
                  </span>
                </div>
                <PersonSummary p={p} />
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <span>Resultado tras fusionar</span>
          <ArrowRight className="h-3 w-3" />
        </div>

        <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-3">
          <div className="flex items-center gap-2">
            <PersonAvatar person={preview} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{preview.fullName}</div>
              <div className="truncate text-[12px] text-muted-foreground">
                {preview.role || preview.company || "—"}
              </div>
            </div>
          </div>
          <PersonSummary p={preview} className="mt-2" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Combinar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonSummary({ p, className }: { p: Person; className?: string }) {
  const lines: { label: string; value: string }[] = [];
  if (p.handles?.email) lines.push({ label: "Email", value: p.handles.email });
  if (p.handles?.phone) lines.push({ label: "Tel", value: p.handles.phone });
  if (p.handles?.linkedin) lines.push({ label: "LinkedIn", value: p.handles.linkedin });
  if (p.company) lines.push({ label: "Empresa", value: p.company });
  if (p.role) lines.push({ label: "Rol", value: p.role });
  if (p.location) lines.push({ label: "Ubicación", value: p.location });
  if ((p.tags ?? []).length) lines.push({ label: "Tags", value: p.tags.join(", ") });
  if ((p.aliases ?? []).length)
    lines.push({ label: "Alias", value: (p.aliases ?? []).join(", ") });

  if (lines.length === 0) return null;
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[12px] ${className ?? ""}`}>
      {lines.map((l) => (
        <div key={l.label} className="contents">
          <dt className="text-muted-foreground">{l.label}</dt>
          <dd className="truncate">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}
