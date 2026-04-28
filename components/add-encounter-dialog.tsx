"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { Encounter } from "@/lib/types";
import { CalendarPlus } from "lucide-react";

export function EncounterDialog({
  open,
  onOpenChange,
  personId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  personId: string;
  initial?: Encounter;
}) {
  const addEncounter = useStore((s) => s.addEncounter);
  const updateEncounter = useStore((s) => s.updateEncounter);
  const events = useStore((s) => s.events);
  const people = useStore((s) => s.people);

  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [context, setContext] = useState("");
  const [eventId, setEventId] = useState("none");
  const [introducedById, setIntroducedById] = useState("none");

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? new Date().toISOString().slice(0, 10));
    setLocation(initial?.location ?? "");
    setContext(initial?.context ?? "");
    setEventId(initial?.eventId ?? "none");
    setIntroducedById(initial?.introducedById ?? "none");
  }, [open, initial]);

  const submit = () => {
    if (!date) return;
    const patch = {
      personId,
      date,
      location: location.trim() || undefined,
      context: context.trim() || undefined,
      eventId: eventId === "none" ? undefined : eventId,
      introducedById: introducedById === "none" ? undefined : introducedById,
    };
    if (initial) {
      updateEncounter(initial.id, patch);
    } else {
      addEncounter({ id: `en-${Date.now()}`, ...patch });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar encuentro" : "Nuevo encuentro"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin evento</SelectItem>
                  {events.map((ev) => (
                    <SelectItem key={ev.id} value={ev.id}>{ev.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Ubicación</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Café Federal, Madrid" />
          </div>
          <div className="space-y-1.5">
            <Label>Me presentó</Label>
            <Select value={introducedById} onValueChange={setIntroducedById}>
              <SelectTrigger><SelectValue placeholder="Nadie en concreto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nadie en concreto</SelectItem>
                {people.filter((p) => p.id !== personId).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.fullName}{p.company ? ` · ${p.company}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contexto</Label>
            <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="De qué hablamos..." rows={3} />
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

export function AddEncounterDialog({ personId }: { personId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus className="h-3.5 w-3.5" /> Encuentro
      </Button>
      <EncounterDialog open={open} onOpenChange={setOpen} personId={personId} />
    </>
  );
}
