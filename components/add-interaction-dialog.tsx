"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { Interaction, InteractionKind } from "@/lib/types";
import { MessageCirclePlus } from "lucide-react";

export function InteractionDialog({
  open,
  onOpenChange,
  personId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  initial?: Interaction;
}) {
  const addInteraction = useStore((s) => s.addInteraction);
  const updateInteraction = useStore((s) => s.updateInteraction);
  const [kind, setKind] = useState<InteractionKind>("nota");
  const [date, setDate] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? "nota");
    setDate(initial?.date ?? new Date().toISOString().slice(0, 10));
    setSummary(initial?.summary ?? "");
    setBody(initial?.body ?? "");
  }, [open, initial]);

  const submit = () => {
    if (!summary.trim()) return;
    const patch = {
      personId,
      kind,
      date,
      summary: summary.trim(),
      body: body.trim() || undefined,
    };
    if (initial) {
      updateInteraction(initial.id, patch);
    } else {
      addInteraction({ id: `i-${Date.now()}`, ...patch });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar nota" : "Nueva interacción"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as InteractionKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nota">Nota</SelectItem>
                  <SelectItem value="llamada">Llamada</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="mensaje">Mensaje</SelectItem>
                  <SelectItem value="reunion">Reunión</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Resumen</Label>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Qué pasó en una frase" />
          </div>
          <div className="space-y-1.5">
            <Label>Detalle (opcional)</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>{initial ? "Guardar" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddInteractionDialog({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageCirclePlus className="h-3.5 w-3.5" /> Nota
      </Button>
      <InteractionDialog open={open} onOpenChange={setOpen} personId={personId} />
    </>
  );
}
