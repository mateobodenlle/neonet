"use client";

import { useState, useMemo } from "react";
import { useParams, notFound } from "next/navigation";
import Link from "next/link";
import { useDerived, useStore } from "@/lib/store";
import { useCompletePromise, useDeleteContact, useDeleteEncounter, useDeleteInteraction, useDeletePainPoint, useDeletePromise, useArchivePerson } from "@/lib/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperaturePicker } from "@/components/temperature-picker";
import { ClosenessPicker } from "@/components/closeness-picker";
import { CategoryPicker } from "@/components/category-picker";
import { TagsEditor } from "@/components/tags-editor";
import { ContactDialog } from "@/components/add-contact-dialog";
import { EncounterDialog, AddEncounterDialog } from "@/components/add-encounter-dialog";
import { InteractionDialog, AddInteractionDialog } from "@/components/add-interaction-dialog";
import { PainPointDialog, AddPainPointDialog } from "@/components/add-painpoint-dialog";
import { PromiseDialog, AddPromiseDialog } from "@/components/add-promise-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, relativeDate } from "@/lib/utils";
import { ArrowLeft, Building2, MapPin, Mail, Phone, Globe, Linkedin, Instagram, Twitter, MoreHorizontal, Pencil, Trash2, Archive, ArchiveRestore, CalendarDays, MessageSquare, StickyNote, TriangleAlert, ChevronDown, Send } from "lucide-react";
import type { Interaction, Encounter, PainPoint, Promise as PromiseT, Temperature, Category, InteractionKind } from "@/lib/types";

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const d = useDerived();
  const updatePerson = useStore((s) => s.updatePerson);
  const addInteraction = useStore((s) => s.addInteraction);
  const completePromise = useCompletePromise();
  const deleteContact = useDeleteContact();
  const archivePerson = useArchivePerson();
  const deleteEncounter = useDeleteEncounter();
  const deleteInteraction = useDeleteInteraction();
  const deletePainPoint = useDeletePainPoint();
  const deletePromise = useDeletePromise();

  const [editingContact, setEditingContact] = useState(false);
  const [editingEncounter, setEditingEncounter] = useState<Encounter | null>(null);
  const [editingInteraction, setEditingInteraction] = useState<Interaction | null>(null);
  const [editingPainPoint, setEditingPainPoint] = useState<PainPoint | null>(null);
  const [editingPromise, setEditingPromise] = useState<PromiseT | null>(null);
  const [quickNote, setQuickNote] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<"all" | InteractionKind>("all");
  const [showCompleted, setShowCompleted] = useState(false);

  const person = d.getPerson(params.id);
  if (!person) notFound();

  const encounters = d.getEncountersByPerson(person.id);
  const interactions = d.getInteractionsByPerson(person.id);
  const painPoints = d.getPainPointsByPerson(person.id);
  const promises = d.getPromisesByPerson(person.id);
  const edges = d.getEdgesForPerson(person.id);

  const firstEncounter = encounters[encounters.length - 1];
  const lastEncounter = encounters[0];
  const now = new Date().toISOString();
  const openPromises = promises.filter((p) => !p.done);
  const donePromises = promises.filter((p) => p.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === "all") return interactions;
    return interactions.filter((i) => i.kind === timelineFilter);
  }, [timelineFilter, interactions]);

  const kindsAvailable = useMemo(() => {
    const set = new Set(interactions.map((i) => i.kind));
    return (["encuentro", "llamada", "email", "mensaje", "reunion", "nota"] as InteractionKind[]).filter((k) => set.has(k));
  }, [interactions]);

  const submitQuickNote = () => {
    const text = quickNote.trim();
    if (!text) return;
    addInteraction({
      id: `i-${Date.now()}`,
      personId: person.id,
      kind: "nota",
      date: new Date().toISOString().slice(0, 10),
      summary: text,
    });
    setQuickNote("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/contacts" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Contactos
        </Link>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Más acciones">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <button onClick={() => setEditingContact(true)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary">
              <Pencil className="h-3.5 w-3.5" /> Editar datos
            </button>
            <button
              onClick={() => archivePerson(person.id, !person.archived, person.fullName)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
            >
              {person.archived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Desarchivar</> : <><Archive className="h-3.5 w-3.5" /> Archivar</>}
            </button>
            <button
              onClick={() => {
                if (confirm(`¿Eliminar a ${person.fullName} y todos sus datos?`)) {
                  deleteContact(person.id, "/contacts");
                }
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Eliminar
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start gap-6">
        <PersonAvatar person={person} className="h-14 w-14 text-base" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{person.fullName}</h1>
              {person.archived && <Badge variant="outline">Archivado</Badge>}
            </div>
            {person.aliases?.length ? (
              <div className="mt-0.5 text-[13px] text-muted-foreground">también: {person.aliases.join(", ")}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {(person.role || person.company) && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {[person.role, person.company].filter(Boolean).join(" · ")}
              </span>
            )}
            {person.location && (
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{person.location}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TemperaturePicker
              value={person.temperature}
              onChange={(t: Temperature) => updatePerson(person.id, { temperature: t })}
            />
            <span className="text-muted-foreground">·</span>
            <ClosenessPicker
              value={person.closeness}
              onChange={(c) => updatePerson(person.id, { closeness: c })}
            />
            <span className="text-muted-foreground">·</span>
            <CategoryPicker
              value={person.category}
              onChange={(c: Category) => updatePerson(person.id, { category: c })}
            />
            {person.sector && <span className="text-[12px] text-muted-foreground">· {person.sector}</span>}
          </div>
          <div className="pt-0.5">
            <TagsEditor
              value={person.tags}
              onChange={(tags) => updatePerson(person.id, { tags })}
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {person.handles?.email && <IconLink icon={<Mail className="h-3.5 w-3.5" />} href={`mailto:${person.handles.email}`} label={person.handles.email} />}
          {person.handles?.phone && <IconLink icon={<Phone className="h-3.5 w-3.5" />} href={`tel:${person.handles.phone}`} label={person.handles.phone} />}
          {person.handles?.linkedin && <IconLink icon={<Linkedin className="h-3.5 w-3.5" />} href={`https://linkedin.com/in/${person.handles.linkedin}`} label="LinkedIn" />}
          {person.handles?.instagram && <IconLink icon={<Instagram className="h-3.5 w-3.5" />} href={`https://instagram.com/${person.handles.instagram}`} label={`@${person.handles.instagram}`} />}
          {person.handles?.twitter && <IconLink icon={<Twitter className="h-3.5 w-3.5" />} href={`https://twitter.com/${person.handles.twitter}`} label={`@${person.handles.twitter}`} />}
          {person.handles?.website && <IconLink icon={<Globe className="h-3.5 w-3.5" />} href={person.handles.website} label="Web" />}
        </div>
      </header>

      {/* Key facts */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-5 py-4 sm:grid-cols-4">
        <Fact label="Primer encuentro" value={firstEncounter ? formatDate(firstEncounter.date) : "—"} />
        <Fact label="Último contacto" value={lastEncounter ? relativeDate(lastEncounter.date) : "—"} />
        <Fact label="Encuentros" value={encounters.length.toString()} />
        <Fact label="Afinidad / confianza" value={`${person.affinity ?? "—"} / ${person.trust ?? "—"}`} />
      </div>

      {person.nextStep && (
        <div className="flex gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-[13px]">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground/80">Siguiente paso</div>
            <div className="mt-0.5 text-muted-foreground">{person.nextStep}</div>
          </div>
          <button onClick={() => setEditingContact(true)} className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground">editar</button>
        </div>
      )}

      {/* Quick add note */}
      <div className="flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <Input
          value={quickNote}
          onChange={(e) => setQuickNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitQuickNote(); }}
          placeholder="Añadir nota rápida y pulsa Enter…"
          className="h-9 flex-1"
        />
        <Button size="sm" variant="outline" onClick={submitQuickNote} disabled={!quickNote.trim()}>
          <Send className="h-3.5 w-3.5" /> Añadir
        </Button>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Unified timeline */}
          <Card>
            <CardHeader className="flex-col items-start gap-3">
              <div className="flex w-full items-center justify-between">
                <CardTitle>Actividad</CardTitle>
                <div className="flex items-center gap-2">
                  <AddEncounterDialog personId={person.id} />
                  <AddInteractionDialog personId={person.id} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <FilterChip label={`Todo · ${interactions.length}`} active={timelineFilter === "all"} onClick={() => setTimelineFilter("all")} />
                {kindsAvailable.map((k) => (
                  <FilterChip
                    key={k}
                    label={`${kindLabel(k)} · ${interactions.filter((i) => i.kind === k).length}`}
                    active={timelineFilter === k}
                    onClick={() => setTimelineFilter(k)}
                  />
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredTimeline.length === 0 ? (
                <div className="px-5 pb-5 text-[13px] text-muted-foreground">Sin actividad.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredTimeline.map((i) => {
                    const encounter = i.encounterId ? d.getEncounter(i.encounterId) : undefined;
                    const ev = encounter?.eventId ? d.getEvent(encounter.eventId) : undefined;
                    return (
                      <li key={i.id} className="group grid grid-cols-[90px_1fr_auto] items-start gap-4 px-5 py-3">
                        <div className="pt-0.5 text-[12px] text-muted-foreground">
                          {formatDate(i.date, { day: "2-digit", month: "short", year: "2-digit" })}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="subtle">{kindLabel(i.kind)}</Badge>
                            <span className="text-[13px]">{i.kind === "encuentro" ? (encounter?.location ?? ev?.location ?? "—") : i.summary}</span>
                            {ev && i.kind === "encuentro" && (
                              <Link href={`/events/${ev.id}`}><Badge variant="accent">{ev.name}</Badge></Link>
                            )}
                          </div>
                          {i.kind === "encuentro" && encounter?.context && <p className="mt-1 text-[13px] text-muted-foreground">{encounter.context}</p>}
                          {i.kind !== "encuentro" && i.body && <p className="mt-1 text-[13px] text-muted-foreground">{i.body}</p>}
                        </div>
                        <RowMenu
                          onEdit={() => {
                            if (i.kind === "encuentro" && encounter) setEditingEncounter(encounter);
                            else setEditingInteraction(i);
                          }}
                          onDelete={() => {
                            if (i.kind === "encuentro" && encounter) {
                              deleteEncounter(encounter.id, person.fullName);
                            } else {
                              deleteInteraction(i.id);
                            }
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Pain points */}
          <Card>
            <CardHeader>
              <CardTitle>Pain points</CardTitle>
              <AddPainPointDialog personId={person.id} />
            </CardHeader>
            <CardContent className="space-y-2">
              {painPoints.length === 0 && <p className="text-[13px] text-muted-foreground">Nada registrado.</p>}
              {painPoints.map((pp) => {
                const en = pp.sourceEncounterId ? d.getEncounter(pp.sourceEncounterId) : undefined;
                return (
                  <div key={pp.id} className="group flex items-start gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-relaxed">{pp.description}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>Captado el {formatDate(pp.createdAt)}</span>
                        {en && <span>· en {en.location ?? formatDate(en.date)}</span>}
                      </div>
                    </div>
                    <RowMenu
                      onEdit={() => setEditingPainPoint(pp)}
                      onDelete={() => deletePainPoint(pp.id)}
                    />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Promises (open) */}
          <Card>
            <CardHeader>
              <CardTitle>Pendientes</CardTitle>
              <AddPromiseDialog personId={person.id} />
            </CardHeader>
            <CardContent className="p-0">
              {openPromises.length === 0 && <div className="px-5 pb-5 text-[13px] text-muted-foreground">Sin pendientes.</div>}
              <ul className="divide-y divide-border">
                {openPromises.map((pr) => {
                  const isOverdue = pr.dueDate && pr.dueDate < now;
                  return (
                    <li key={pr.id} className="group flex items-start gap-3 px-5 py-2.5">
                      <Checkbox checked={pr.done} onCheckedChange={() => completePromise(pr.id, pr.done, person.fullName)} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px]">{pr.description}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                          <span>{pr.direction === "yo-a-el" ? "yo →" : "← ellos"}</span>
                          {pr.dueDate && (
                            <span className={isOverdue ? "text-destructive" : ""}>
                              · {formatDate(pr.dueDate, { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <RowMenu
                        onEdit={() => setEditingPromise(pr)}
                        onDelete={() => deletePromise(pr.id)}
                      />
                    </li>
                  );
                })}
              </ul>
              {donePromises.length > 0 && (
                <div className="border-t border-border">
                  <button
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex w-full items-center justify-between px-5 py-2 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <span>{donePromises.length} completados</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCompleted ? "rotate-180" : ""}`} />
                  </button>
                  {showCompleted && (
                    <ul className="divide-y divide-border">
                      {donePromises.map((pr) => (
                        <li key={pr.id} className="flex items-start gap-3 px-5 py-2">
                          <Checkbox checked={pr.done} onCheckedChange={() => completePromise(pr.id, pr.done, person.fullName)} className="mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] text-muted-foreground line-through">{pr.description}</div>
                            {pr.completedAt && <div className="mt-0.5 text-[11px] text-muted-foreground/70">cerrado {relativeDate(pr.completedAt)}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {edges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Conexiones</CardTitle>
                <span className="text-[12px] text-muted-foreground">{edges.length}</span>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {edges.map((e) => {
                    const otherId = e.fromPersonId === person.id ? e.toPersonId : e.fromPersonId;
                    const other = d.getPerson(otherId);
                    if (!other) return null;
                    return (
                      <li key={e.id}>
                        <Link href={`/contacts/${other.id}`} className="flex items-center gap-3 px-5 py-2 hover:bg-secondary/40">
                          <PersonAvatar person={other} className="h-7 w-7" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium">{other.fullName}</div>
                            <div className="truncate text-[12px] text-muted-foreground">{e.kind}{e.note ? ` · ${e.note}` : ""}</div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {person.interests?.length ? (
            <Card>
              <CardHeader><CardTitle>Intereses</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {person.interests.map((i) => <Badge key={i} variant="subtle">{i}</Badge>)}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ContactDialog open={editingContact} onOpenChange={setEditingContact} initial={person} />
      <EncounterDialog open={!!editingEncounter} onOpenChange={(v) => !v && setEditingEncounter(null)} personId={person.id} initial={editingEncounter ?? undefined} />
      <InteractionDialog open={!!editingInteraction} onOpenChange={(v) => !v && setEditingInteraction(null)} personId={person.id} initial={editingInteraction ?? undefined} />
      <PainPointDialog open={!!editingPainPoint} onOpenChange={(v) => !v && setEditingPainPoint(null)} personId={person.id} initial={editingPainPoint ?? undefined} />
      <PromiseDialog open={!!editingPromise} onOpenChange={(v) => !v && setEditingPromise(null)} personId={person.id} initial={editingPromise ?? undefined} />
    </div>
  );
}

function kindLabel(k: InteractionKind): string {
  const labels: Record<InteractionKind, string> = {
    encuentro: "Encuentro",
    llamada: "Llamada",
    email: "Email",
    mensaje: "Mensaje",
    reunion: "Reunión",
    nota: "Nota",
  };
  return labels[k];
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${
        active ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {label}
    </button>
  );
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="opacity-0 transition-opacity hover:bg-secondary rounded-md px-1 py-1 group-hover:opacity-100" aria-label="Acciones">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        <button onClick={onEdit} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary">
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
        <button onClick={onDelete} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3.5 w-3.5" /> Eliminar
        </button>
      </PopoverContent>
    </Popover>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[14px] font-medium">{value}</div>
    </div>
  );
}

function IconLink({ icon, href, label }: { icon: React.ReactNode; href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
      title={label}
    >
      {icon}
      <span className="max-w-[160px] truncate">{label}</span>
    </a>
  );
}
