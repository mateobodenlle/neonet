"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { PersonAvatar } from "@/components/person-avatar";
import { CalendarDays, Users, MessageSquare, TriangleAlert, Plus } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const people = useStore((s) => s.people);
  const events = useStore((s) => s.events);
  const painPoints = useStore((s) => s.painPoints);
  const interactions = useStore((s) => s.interactions);
  const [q, setQ] = useState("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName ?? "")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = (path: string) => {
    router.push(path);
    setOpen(false);
    setQ("");
  };

  const matchedPainPoints = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return painPoints.filter((pp) => pp.description.toLowerCase().includes(needle)).slice(0, 5);
  }, [q, painPoints]);

  const matchedNotes = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return interactions
      .filter((i) => i.kind !== "encuentro")
      .filter((i) => i.summary.toLowerCase().includes(needle) || i.body?.toLowerCase().includes(needle))
      .slice(0, 5);
  }, [q, interactions]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar contactos, empresas, pain points, notas..."
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>{q ? "Sin resultados." : "Escribe para buscar, o elige abajo."}</CommandEmpty>

            {!q && (
              <CommandGroup heading="Acciones">
                <CommandItem onSelect={() => go("/contacts")}>
                  <Users className="h-3.5 w-3.5 text-muted-foreground" /> Ver todos los contactos
                </CommandItem>
                <CommandItem onSelect={() => go("/events")}>
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /> Ver eventos
                </CommandItem>
              </CommandGroup>
            )}

            <PeopleMatches q={q} people={people} onGo={go} />
            <EventMatches q={q} events={events} onGo={go} />

            {matchedPainPoints.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Pain points">
                  {matchedPainPoints.map((pp) => {
                    const person = people.find((p) => p.id === pp.personId);
                    return (
                      <CommandItem key={pp.id} onSelect={() => go(`/contacts/${pp.personId}`)}>
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px]">{pp.description}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{person?.fullName}</div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {matchedNotes.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Notas">
                  {matchedNotes.map((n) => {
                    const person = people.find((p) => p.id === n.personId);
                    return (
                      <CommandItem key={n.id} onSelect={() => go(`/contacts/${n.personId}`)}>
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px]">{n.summary}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{person?.fullName} · {n.kind}</div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ para navegar · ↵ para abrir</span>
            <span>Cmd/Ctrl+K</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function PeopleMatches({ q, people, onGo }: { q: string; people: ReturnType<typeof useStore.getState>["people"]; onGo: (p: string) => void }) {
  const matched = useMemo(() => {
    if (!q.trim()) return people.slice(0, 6);
    const needle = q.toLowerCase();
    return people
      .filter((p) => {
        const hay = [p.fullName, p.company, p.role, p.location, ...(p.aliases ?? []), ...(p.tags ?? [])].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [q, people]);

  if (matched.length === 0) return null;
  return (
    <CommandGroup heading={q ? "Contactos" : "Recientes"}>
      {matched.map((p) => (
        <CommandItem key={p.id} value={`${p.fullName} ${p.company ?? ""} ${p.role ?? ""}`} onSelect={() => onGo(`/contacts/${p.id}`)}>
          <PersonAvatar person={p} className="h-6 w-6 text-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{p.fullName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{[p.role, p.company].filter(Boolean).join(" · ")}</div>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function EventMatches({ q, events, onGo }: { q: string; events: ReturnType<typeof useStore.getState>["events"]; onGo: (p: string) => void }) {
  const matched = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return events.filter((e) => e.name.toLowerCase().includes(needle) || e.location?.toLowerCase().includes(needle)).slice(0, 4);
  }, [q, events]);

  if (matched.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading="Eventos">
        {matched.map((e) => (
          <CommandItem key={e.id} value={`event-${e.name}`} onSelect={() => onGo(`/events/${e.id}`)}>
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px]">{e.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{e.location}</div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
