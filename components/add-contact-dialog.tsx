"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { Category, Sector, Temperature, Seniority, Person, SocialHandles } from "@/lib/types";
import { Plus } from "lucide-react";

interface FormState {
  fullName: string;
  aliases: string;
  role: string;
  company: string;
  location: string;
  category: Category;
  temperature: Temperature;
  sector: Sector;
  seniority: Seniority;
  tags: string;
  nextStep: string;
  email: string;
  phone: string;
  linkedin: string;
  instagram: string;
}

const empty: FormState = {
  fullName: "",
  aliases: "",
  role: "",
  company: "",
  location: "",
  category: "cliente-potencial",
  temperature: "tibio",
  sector: "otro",
  seniority: "senior",
  tags: "",
  nextStep: "",
  email: "",
  phone: "",
  linkedin: "",
  instagram: "",
};

function fromPerson(p: Person): FormState {
  return {
    fullName: p.fullName,
    aliases: (p.aliases ?? []).join(", "),
    role: p.role ?? "",
    company: p.company ?? "",
    location: p.location ?? "",
    category: p.category,
    temperature: p.temperature,
    sector: p.sector ?? "otro",
    seniority: p.seniority ?? "senior",
    tags: (p.tags ?? []).join(", "),
    nextStep: p.nextStep ?? "",
    email: p.handles?.email ?? "",
    phone: p.handles?.phone ?? "",
    linkedin: p.handles?.linkedin ?? "",
    instagram: p.handles?.instagram ?? "",
  };
}

export function ContactDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Person;
}) {
  const addPerson = useStore((s) => s.addPerson);
  const updatePerson = useStore((s) => s.updatePerson);
  const [f, setF] = useState<FormState>(initial ? fromPerson(initial) : empty);

  useEffect(() => {
    if (open) setF(initial ? fromPerson(initial) : empty);
  }, [open, initial]);

  const submit = () => {
    if (!f.fullName.trim()) return;
    const handles: SocialHandles = {};
    if (f.email.trim()) handles.email = f.email.trim();
    if (f.phone.trim()) handles.phone = f.phone.trim();
    if (f.linkedin.trim()) handles.linkedin = f.linkedin.trim();
    if (f.instagram.trim()) handles.instagram = f.instagram.trim();
    const patch = {
      fullName: f.fullName.trim(),
      aliases: f.aliases.split(",").map((s) => s.trim()).filter(Boolean),
      role: f.role.trim() || undefined,
      company: f.company.trim() || undefined,
      location: f.location.trim() || undefined,
      category: f.category,
      temperature: f.temperature,
      sector: f.sector,
      seniority: f.seniority,
      tags: f.tags.split(",").map((s) => s.trim()).filter(Boolean),
      nextStep: f.nextStep.trim() || undefined,
      handles: Object.keys(handles).length ? handles : undefined,
    };
    if (initial) {
      updatePerson(initial.id, patch);
    } else {
      const now = new Date().toISOString();
      addPerson({ id: `p${Date.now()}`, createdAt: now, updatedAt: now, ...patch });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
          <DialogDescription>Datos mínimos. Puedes cambiar temperatura, categoría y tags directamente desde la ficha.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto md:grid-cols-2">
          <Field label="Nombre completo *"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Jaime López-Moreno" /></Field>
          <Field label="Aliases (coma)"><Input value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder="Jaime, Jaimito" /></Field>
          <Field label="Rol"><Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="CTO" /></Field>
          <Field label="Empresa"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="Flexo Retail" /></Field>
          <Field label="Ubicación"><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Madrid" /></Field>
          <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="jaime@flexo.es" /></Field>
          <Field label="Teléfono"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+34 611 222 333" /></Field>
          <Field label="LinkedIn"><Input value={f.linkedin} onChange={(e) => setF({ ...f, linkedin: e.target.value })} placeholder="jaimelopezmoreno" /></Field>

          <Field label="Categoría">
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v as Category })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cliente-potencial">Prospect</SelectItem>
                <SelectItem value="cliente">Cliente</SelectItem>
                <SelectItem value="inversor">Inversor</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="talento">Talento</SelectItem>
                <SelectItem value="amigo">Amigo</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Temperatura">
            <Select value={f.temperature} onValueChange={(v) => setF({ ...f, temperature: v as Temperature })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caliente">Caliente</SelectItem>
                <SelectItem value="tibio">Tibio</SelectItem>
                <SelectItem value="frio">Frío</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sector">
            <Select value={f.sector} onValueChange={(v) => setF({ ...f, sector: v as Sector })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["fintech","saas","ecommerce","industria","salud","energia","edtech","legaltech","retail","logistica","media","consultoria","otro"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Seniority">
            <Select value={f.seniority} onValueChange={(v) => setF({ ...f, seniority: v as Seniority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="junior">Junior</SelectItem>
                <SelectItem value="mid">Mid</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="c-level">C-level</SelectItem>
                <SelectItem value="founder">Founder</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="md:col-span-2">
            <Field label="Tags (coma)"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="decision-maker, visión-artificial" /></Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Next step"><Textarea value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} placeholder="Enviar propuesta POC..." rows={2} /></Field>
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

export function AddContactDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-3.5 w-3.5" /> Nuevo contacto</Button>
      <ContactDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
