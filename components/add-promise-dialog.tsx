"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { Promise as PromiseT } from "@/lib/types";
import { ListPlus } from "lucide-react";

export function PromiseDialog({
  open,
  onOpenChange,
  personId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  initial?: PromiseT;
}) {
  const addPromise = useStore((s) => s.addPromise);
  const updatePromise = useStore((s) => s.updatePromise);
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<"yo-a-el" | "el-a-mi">("yo-a-el");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescription(initial?.description ?? "");
    setDirection(initial?.direction ?? "yo-a-el");
    setDueDate(initial?.dueDate ?? "");
  }, [open, initial]);

  const submit = () => {
    if (!description.trim()) return;
    const patch = {
      personId,
      description: description.trim(),
      direction,
      dueDate: dueDate || undefined,
    };
    if (initial) {
      updatePromise(initial.id, patch);
    } else {
      addPromise({
        id: `pr-${Date.now()}`,
        alsoPersonIds: [],
        done: false,
        createdAt: new Date().toISOString(),
        ...patch,
      });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar compromiso" : "Nuevo compromiso"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Qué</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enviar propuesta POC..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dirección</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "yo-a-el" | "el-a-mi")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yo-a-el">Yo → él/ella</SelectItem>
                  <SelectItem value="el-a-mi">Él/ella → yo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
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

export function AddPromiseDialog({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ListPlus className="h-3.5 w-3.5" /> Compromiso
      </Button>
      <PromiseDialog open={open} onOpenChange={setOpen} personId={personId} />
    </>
  );
}
