"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ListPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, relativeDate } from "@/lib/utils";
import {
  fetchPromiseObservations,
  togglePromiseDone,
  editPromiseObservation,
  deletePromiseObservation,
  createPromiseObservation,
  type PromiseItem,
} from "@/lib/promise-actions";

const UNDO_MS = 15_000;

interface Props {
  personId: string;
  personName: string;
}

export function PersonPendientesCard({ personId, personName }: Props) {
  const [items, setItems] = useState<PromiseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PromiseItem | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const rows = await fetchPromiseObservations({
        personId,
        includeDone: true,
      });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchPromiseObservations({ personId, includeDone: true })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const open = (items ?? []).filter((x) => !x.done);
  const done = (items ?? [])
    .filter((x) => x.done)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const toggle = async (p: PromiseItem) => {
    if (!items) return;
    const before = items;
    // Optimistic: flip locally; reload after for the new id.
    setItems(
      items.map((x) =>
        x.observationId === p.observationId
          ? { ...x, done: !p.done, completedAt: !p.done ? new Date().toISOString() : undefined }
          : x
      )
    );
    try {
      const newId = await togglePromiseDone(p.observationId, !p.done);
      // Replace the old observationId reference so further toggles work.
      setItems((prev) =>
        prev
          ? prev.map((x) =>
              x.observationId === p.observationId
                ? { ...x, observationId: newId, done: !p.done }
                : x
            )
          : prev
      );
      if (!p.done) {
        toast(`Completado · ${personName}`, {
          duration: UNDO_MS,
          action: {
            label: "Deshacer",
            onClick: async () => {
              try {
                const undoneId = await togglePromiseDone(newId, false);
                setItems((prev) =>
                  prev
                    ? prev.map((x) =>
                        x.observationId === newId
                          ? { ...x, observationId: undoneId, done: false, completedAt: undefined }
                          : x
                      )
                    : prev
                );
              } catch (e) {
                console.error(e);
                toast.error("No se pudo deshacer.");
              }
            },
          },
        });
      }
    } catch (e) {
      console.error(e);
      setItems(before);
      toast.error("No se pudo actualizar.");
    }
  };

  const remove = async (p: PromiseItem) => {
    if (!items) return;
    const before = items;
    setItems(items.filter((x) => x.observationId !== p.observationId));
    try {
      await deletePromiseObservation(p.observationId);
      toast("Compromiso eliminado");
    } catch (e) {
      console.error(e);
      setItems(before);
      toast.error("No se pudo eliminar.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pendientes</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <ListPlus className="h-3.5 w-3.5" /> Compromiso
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 pb-5 text-[13px] text-muted-foreground">
            Cargando…
          </div>
        ) : open.length === 0 ? (
          <div className="px-5 pb-5 text-[13px] text-muted-foreground">
            Sin pendientes.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {open.map((pr) => (
              <Row
                key={pr.observationId}
                item={pr}
                onToggle={() => toggle(pr)}
                onEdit={() => setEditing(pr)}
                onDelete={() => remove(pr)}
              />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <div className="border-t border-border">
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <span>{done.length} completados</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  showCompleted ? "rotate-180" : ""
                }`}
              />
            </button>
            {showCompleted && (
              <ul className="divide-y divide-border">
                {done.map((pr) => (
                  <li
                    key={pr.observationId}
                    className="flex items-start gap-3 px-5 py-2"
                  >
                    <Checkbox
                      checked
                      onCheckedChange={() => toggle(pr)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-muted-foreground line-through">
                        {pr.content}
                      </div>
                      {pr.completedAt && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                          cerrado {relativeDate(pr.completedAt)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
      <PromiseDialog
        open={adding}
        onOpenChange={setAdding}
        onSubmit={async ({ content, direction, dueDate }) => {
          await createPromiseObservation({
            primaryPersonId: personId,
            content,
            direction,
            dueDate: dueDate || undefined,
          });
          await reload();
        }}
      />
      <PromiseDialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        initial={editing ?? undefined}
        onSubmit={async ({ content, direction, dueDate }) => {
          if (!editing) return;
          await editPromiseObservation(editing.observationId, {
            content,
            direction,
            dueDate: dueDate || null,
          });
          setEditing(null);
          await reload();
        }}
      />
    </Card>
  );
}

function Row({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: PromiseItem;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = item.dueDate && item.dueDate < today;
  return (
    <li className="group flex items-start gap-3 px-5 py-2.5">
      <Checkbox checked={item.done} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{item.content}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{item.direction === "yo-a-el" ? "yo →" : "← ellos"}</span>
          {item.dueDate && (
            <span className={isOverdue ? "text-destructive" : ""}>
              · {formatDate(item.dueDate, { day: "2-digit", month: "short" })}
            </span>
          )}
        </div>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="opacity-0 transition-opacity hover:bg-secondary rounded-md px-1 py-1 group-hover:opacity-100"
            aria-label="Acciones"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-36 p-1">
          <button
            onClick={onEdit}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <button
            onClick={onDelete}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Eliminar
          </button>
        </PopoverContent>
      </Popover>
    </li>
  );
}

function PromiseDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: PromiseItem;
  onSubmit: (input: {
    content: string;
    direction: "yo-a-el" | "el-a-mi";
    dueDate: string;
  }) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [direction, setDirection] = useState<"yo-a-el" | "el-a-mi">("yo-a-el");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContent(initial?.content ?? "");
    setDirection(initial?.direction ?? "yo-a-el");
    setDueDate(initial?.dueDate ?? "");
  }, [open, initial]);

  const submit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ content: content.trim(), direction, dueDate });
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("No se pudo guardar.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar compromiso" : "Nuevo compromiso"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Qué</Label>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enviar propuesta POC..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Select
                value={direction}
                onValueChange={(v) =>
                  setDirection(v as "yo-a-el" | "el-a-mi")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yo-a-el">Yo → él/ella</SelectItem>
                  <SelectItem value="el-a-mi">Él/ella → yo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {initial ? "Guardar" : "Crear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
