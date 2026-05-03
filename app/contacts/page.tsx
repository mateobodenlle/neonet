"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useDeleteContact, useArchivePerson } from "@/lib/actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { CategoryBadge } from "@/components/category-badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, MoreHorizontal, Pencil, Archive, ArchiveRestore, Trash2, Combine } from "lucide-react";
import { AddContactDialog, ContactDialog } from "@/components/add-contact-dialog";
import { MergeContactsDialog } from "@/components/merge-contacts-dialog";
import type { Category, Sector, Temperature, Person } from "@/lib/types";
import { relativeDate, foldText } from "@/lib/utils";

type SortBy = "recency" | "alpha" | "affinity" | "encounters";

export default function ContactsPage() {
  const people = useStore((s) => s.people);
  const encounters = useStore((s) => s.encounters);
  const bulkDeletePeople = useStore((s) => s.bulkDeletePeople);
  const deleteContact = useDeleteContact();
  const archivePerson = useArchivePerson();

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "todas">("todas");
  const [temp, setTemp] = useState<Temperature | "todas">("todas");
  const [sector, setSector] = useState<Sector | "todos">("todos");
  const [sort, setSort] = useState<SortBy>("recency");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  const stats = useMemo(() => {
    const last = new Map<string, string>();
    const count = new Map<string, number>();
    for (const en of encounters) {
      count.set(en.personId, (count.get(en.personId) ?? 0) + 1);
      const prev = last.get(en.personId);
      if (!prev || prev < en.date) last.set(en.personId, en.date);
    }
    return { last, count };
  }, [encounters]);

  const filtered = useMemo(() => {
    const needle = foldText(q.trim());
    let list = people.filter((p) => {
      if (!showArchived && p.archived) return false;
      if (showArchived && !p.archived) return false;
      if (cat !== "todas" && p.category !== cat) return false;
      if (temp !== "todas" && p.temperature !== temp) return false;
      if (sector !== "todos" && p.sector !== sector) return false;
      if (!needle) return true;
      const hay = foldText(
        [p.fullName, p.role, p.company, p.location, ...(p.tags ?? []), ...(p.aliases ?? [])]
          .filter(Boolean)
          .join(" ")
      );
      return hay.includes(needle);
    });

    switch (sort) {
      case "alpha":
        list = list.slice().sort((a, b) => a.fullName.localeCompare(b.fullName, "es"));
        break;
      case "affinity":
        list = list.slice().sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
        break;
      case "encounters":
        list = list.slice().sort((a, b) => (stats.count.get(b.id) ?? 0) - (stats.count.get(a.id) ?? 0));
        break;
      default:
        list = list.slice().sort((a, b) => (stats.last.get(b.id) ?? "").localeCompare(stats.last.get(a.id) ?? ""));
    }
    return list;
  }, [people, q, cat, temp, sector, sort, showArchived, stats]);

  const archivedCount = people.filter((p) => p.archived).length;

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allSelectedInView =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelectedInView =
    !allSelectedInView && filteredIds.some((id) => selected.has(id));

  function toggleOne(id: string, e: React.MouseEvent | React.KeyboardEvent) {
    const isShift = "shiftKey" in e && e.shiftKey;
    const next = new Set(selected);
    if (isShift && lastClickedId && lastClickedId !== id) {
      const a = filteredIds.indexOf(lastClickedId);
      const b = filteredIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const shouldSelect = !next.has(id);
        for (let i = from; i <= to; i++) {
          if (shouldSelect) next.add(filteredIds[i]);
          else next.delete(filteredIds[i]);
        }
        setSelected(next);
        setLastClickedId(id);
        return;
      }
    }
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setLastClickedId(id);
  }

  function toggleAllInView() {
    const next = new Set(selected);
    if (allSelectedInView) {
      for (const id of filteredIds) next.delete(id);
    } else {
      for (const id of filteredIds) next.add(id);
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
    setLastClickedId(null);
  }

  const mergeCandidates = useMemo<[Person, Person] | null>(() => {
    if (selected.size !== 2) return null;
    const ids = [...selected];
    const a = people.find((p) => p.id === ids[0]);
    const b = people.find((p) => p.id === ids[1]);
    return a && b ? [a, b] : null;
  }, [selected, people]);

  function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `¿Eliminar ${ids.length} contacto${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`
      )
    )
      return;
    const n = bulkDeletePeople(ids);
    clearSelection();
    toast.success(`${n} contacto${n === 1 ? "" : "s"} eliminado${n === 1 ? "" : "s"}`);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {filtered.length} de {people.length}{showArchived ? ` archivados` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/contacts/review">Revisar conexiones</Link>
          </Button>
          <AddContactDialog />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="h-8 pl-8"
          />
        </div>
        <FilterSelect value={cat} onChange={(v) => setCat(v as Category | "todas")} label="Categoría" options={[
          { v: "todas", l: "Todas" },
          { v: "cliente-potencial", l: "Prospect" },
          { v: "cliente", l: "Cliente" },
          { v: "inversor", l: "Inversor" },
          { v: "partner", l: "Partner" },
          { v: "talento", l: "Talento" },
          { v: "amigo", l: "Amigo" },
          { v: "otro", l: "Otro" },
        ]} />
        <FilterSelect value={temp} onChange={(v) => setTemp(v as Temperature | "todas")} label="Temperatura" options={[
          { v: "todas", l: "Todas" },
          { v: "caliente", l: "Caliente" },
          { v: "tibio", l: "Tibio" },
          { v: "frio", l: "Frío" },
        ]} />
        <FilterSelect value={sector} onChange={(v) => setSector(v as Sector | "todos")} label="Sector" options={[
          { v: "todos", l: "Todos" },
          ...["fintech","saas","ecommerce","industria","salud","energia","edtech","legaltech","retail","logistica","media","consultoria","otro"].map((s) => ({ v: s, l: s })),
        ]} />
        <Select value={sort} onValueChange={(v) => setSort(v as SortBy)}>
          <SelectTrigger className="h-8 w-[160px] text-[13px]" aria-label="Ordenar"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recency">Más reciente</SelectItem>
            <SelectItem value="alpha">Alfabético</SelectItem>
            <SelectItem value="affinity">Afinidad</SelectItem>
            <SelectItem value="encounters">Nº encuentros</SelectItem>
          </SelectContent>
        </Select>
        {archivedCount > 0 && (
          <Button
            size="sm"
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Ver activos" : `Ver archivados (${archivedCount})`}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_110px_110px_90px_40px] items-center gap-4 border-b border-border bg-secondary/30 px-4 py-2 text-[12px] text-muted-foreground">
          <Checkbox
            checked={allSelectedInView}
            onCheckedChange={() => toggleAllInView()}
            aria-label={
              someSelectedInView
                ? "Algunos seleccionados — clic para seleccionar todos"
                : "Seleccionar todos los visibles"
            }
          />
          <span>Nombre</span>
          <span>Rol / empresa</span>
          <span>Categoría</span>
          <span>Temp.</span>
          <span className="text-right">Última</span>
          <span />
        </div>
        <ul className="divide-y divide-border">
          {filtered.map((p) => {
            const last = stats.last.get(p.id);
            const isSelected = selected.has(p.id);
            return (
              <li
                key={p.id}
                className={`group grid grid-cols-[28px_minmax(0,2fr)_minmax(0,1fr)_110px_110px_90px_40px] items-center gap-4 px-4 py-2.5 hover:bg-secondary/40 ${
                  isSelected ? "bg-accent/5" : ""
                }`}
              >
                <span
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleOne(p.id, e);
                  }}
                  className="flex h-full items-center cursor-pointer"
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggleOne(p.id, e);
                    }
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    aria-label={`Seleccionar ${p.fullName}`}
                    className="pointer-events-none"
                  />
                </span>
                <Link href={`/contacts/${p.id}`} className="flex min-w-0 items-center gap-3">
                  <PersonAvatar person={p} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{p.fullName}</div>
                    {p.location && <div className="truncate text-[12px] text-muted-foreground">{p.location}</div>}
                  </div>
                </Link>
                <Link href={`/contacts/${p.id}`} className="min-w-0">
                  <div className="truncate text-[13px]">{p.role ?? "—"}</div>
                  {p.company && <div className="truncate text-[12px] text-muted-foreground">{p.company}</div>}
                </Link>
                <Link href={`/contacts/${p.id}`}><CategoryBadge category={p.category} /></Link>
                <Link href={`/contacts/${p.id}`}><TemperatureBadge temperature={p.temperature} /></Link>
                <Link href={`/contacts/${p.id}`} className="text-right text-[12px] text-muted-foreground">{last ? relativeDate(last) : "—"}</Link>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="opacity-0 transition-opacity group-hover:opacity-100 rounded p-1 hover:bg-secondary" aria-label="Acciones">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-40 p-1">
                    <button onClick={() => setEditing(p)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                    <button onClick={() => archivePerson(p.id, !p.archived, p.fullName)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary">
                      {p.archived ? <><ArchiveRestore className="h-3.5 w-3.5" /> Desarchivar</> : <><Archive className="h-3.5 w-3.5" /> Archivar</>}
                    </button>
                    <button
                      onClick={() => { if (confirm(`¿Eliminar a ${p.fullName}?`)) deleteContact(p.id); }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  </PopoverContent>
                </Popover>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="p-12 text-center text-[13px] text-muted-foreground">Sin resultados.</li>
          )}
        </ul>
      </div>

      <ContactDialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} initial={editing ?? undefined} />

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 shadow-lg flex items-center gap-3">
          <span className="text-[13px]">
            <strong>{selected.size}</strong> seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            Limpiar
          </Button>
          {mergeCandidates && (
            <Button size="sm" variant="outline" onClick={() => setMergeOpen(true)}>
              <Combine className="h-3.5 w-3.5" />
              Combinar
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={bulkDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
        </div>
      )}

      <MergeContactsDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        people={mergeCandidates}
        onMerged={clearSelection}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { v: string; l: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[150px] text-[13px]" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
