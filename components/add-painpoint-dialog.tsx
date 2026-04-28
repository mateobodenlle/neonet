"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore, useDerived } from "@/lib/store";
import type { PainPoint } from "@/lib/types";
import { TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function PainPointDialog({
  open,
  onOpenChange,
  personId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  initial?: PainPoint;
}) {
  const addPainPoint = useStore((s) => s.addPainPoint);
  const updatePainPoint = useStore((s) => s.updatePainPoint);
  const d = useDerived();
  const encounters = d.getEncountersByPerson(personId);

  const [description, setDescription] = useState("");
  const [sourceEncounterId, setSourceEncounterId] = useState("none");

  useEffect(() => {
    if (!open) return;
    setDescription(initial?.description ?? "");
    setSourceEncounterId(initial?.sourceEncounterId ?? (encounters[0]?.id ?? "none"));
  }, [open, initial, encounters]);

  const submit = () => {
    if (!description.trim()) return;
    const patch = {
      personId,
      description: description.trim(),
      sourceEncounterId: sourceEncounterId === "none" ? undefined : sourceEncounterId,
    };
    if (initial) {
      updatePainPoint(initial.id, patch);
    } else {
      addPainPoint({ id: `pp-${Date.now()}`, createdAt: new Date().toISOString(), ...patch });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar pain point" : "Pain point detectado"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tiene problemas de gestión de stock en 42 tiendas..." rows={4} />
          </div>
          {encounters.length > 0 && (
            <div className="space-y-1.5">
              <Label>Detectado en</Label>
              <Select value={sourceEncounterId} onValueChange={setSourceEncounterId}>
                <SelectTrigger><SelectValue placeholder="Sin encuentro específico" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin encuentro específico</SelectItem>
                  {encounters.map((en) => (
                    <SelectItem key={en.id} value={en.id}>
                      {formatDate(en.date, { day: "2-digit", month: "short", year: "2-digit" })} · {en.location ?? d.getEvent(en.eventId ?? "")?.name ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>{initial ? "Guardar" : "Crear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddPainPointDialog({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <TriangleAlert className="h-3.5 w-3.5" /> Pain point
      </Button>
      <PainPointDialog open={open} onOpenChange={setOpen} personId={personId} />
    </>
  );
}
