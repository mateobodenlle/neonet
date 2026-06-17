"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { foldText, formatDate } from "@/lib/utils";
import { semanticSearch, type SemanticPersonResult } from "@/lib/search-actions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { PersonAvatar } from "@/components/person-avatar";
import { CalendarDays, Users, MessageSquare, Sparkles, Loader2, ArrowLeft } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const people = useStore((s) => s.people);
  const events = useStore((s) => s.events);
  const interactions = useStore((s) => s.interactions);
  const [q, setQ] = useState("");

  // Semantic "ask" state. askedFor records the query that produced the
  // current results so editing the box re-offers the "Preguntar" action.
  const [asking, setAsking] = useState(false);
  const [askResults, setAskResults] = useState<SemanticPersonResult[] | null>(null);
  const [askedFor, setAskedFor] = useState("");

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

  // Reset semantic results whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setQ("");
      setAskResults(null);
      setAskedFor("");
    }
  }, [open]);

  const go = (path: string) => {
    router.push(path);
    setOpen(false);
    setQ("");
  };

  const trimmed = q.trim();
  const canAsk = trimmed.length >= 3;
  const showingAsk = askResults !== null && askedFor === trimmed;

  async function runAsk() {
    if (!canAsk || asking) return;
    setAsking(true);
    try {
      const res = await semanticSearch(trimmed);
      setAskResults(res);
      setAskedFor(trimmed);
    } catch (e) {
      toast.error("No se pudo preguntar a la memoria", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAsking(false);
    }
  }

  const matchedNotes = useMemo(() => {
    if (!trimmed) return [];
    const needle = foldText(q);
    return interactions
      .filter((i) => i.kind !== "encuentro")
      .filter((i) => foldText(i.summary).includes(needle) || foldText(i.body).includes(needle))
      .slice(0, 5);
  }, [q, trimmed, interactions]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar contactos, o pregunta a la memoria…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>{trimmed ? "Sin resultados." : "Escribe para buscar, o elige abajo."}</CommandEmpty>

            {/* Semantic ask affordance — offered while a fresh query is typed. */}
            {canAsk && !showingAsk && (
              <CommandGroup heading="Memoria">
                <CommandItem value="__ask__" onSelect={runAsk}>
                  {asking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                  )}
                  <span className="truncate">
                    Preguntar a la memoria: <span className="text-muted-foreground">«{trimmed}»</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {showingAsk ? (
              <AskResults
                results={askResults!}
                people={people}
                onGo={go}
                onBack={() => {
                  setAskResults(null);
                  setAskedFor("");
                }}
              />
            ) : (
              <>
                {!trimmed && (
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
              </>
            )}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ navegar · ↵ abrir · ⏎ en «Preguntar» busca por significado</span>
            <span>Cmd/Ctrl+K</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function AskResults({
  results,
  people,
  onGo,
  onBack,
}: {
  results: SemanticPersonResult[];
  people: ReturnType<typeof useStore.getState>["people"];
  onGo: (p: string) => void;
  onBack: () => void;
}) {
  return (
    <CommandGroup heading="Respuesta de la memoria">
      <CommandItem value="__ask_back__" onSelect={onBack}>
        <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" /> Volver a filtrar
      </CommandItem>
      {results.length === 0 ? (
        <div className="px-2 py-3 text-[12px] text-muted-foreground">
          Nada en la memoria responde a eso todavía.
        </div>
      ) : (
        results.map((r) => {
          const person = people.find((p) => p.id === r.personId);
          const top = r.hits[0];
          return (
            <CommandItem
              key={r.personId}
              value={`ask-${r.personId}`}
              onSelect={() => onGo(`/contacts/${r.personId}`)}
              className="items-start"
            >
              {person ? (
                <PersonAvatar person={person} className="mt-0.5 h-6 w-6 text-[10px]" />
              ) : (
                <Sparkles className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{r.personName}</span>
                  {r.company && <span className="truncate text-[11px] text-muted-foreground">· {r.company}</span>}
                </div>
                {top && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {top.facetType ? `${top.facetType} · ` : ""}
                    {top.content}
                    {top.observedAt ? ` · ${formatDate(top.observedAt)}` : ""}
                  </div>
                )}
                {r.hits.length > 1 && (
                  <div className="text-[10px] text-muted-foreground">+{r.hits.length - 1} más</div>
                )}
              </div>
            </CommandItem>
          );
        })
      )}
    </CommandGroup>
  );
}

function PeopleMatches({ q, people, onGo }: { q: string; people: ReturnType<typeof useStore.getState>["people"]; onGo: (p: string) => void }) {
  const matched = useMemo(() => {
    if (!q.trim()) return people.slice(0, 6);
    const needle = foldText(q);
    return people
      .filter((p) => {
        const hay = foldText(
          [p.fullName, p.company, p.role, p.location, ...(p.aliases ?? []), ...(p.tags ?? [])]
            .filter(Boolean)
            .join(" ")
        );
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
    const needle = foldText(q);
    return events
      .filter((e) => foldText(e.name).includes(needle) || foldText(e.location).includes(needle))
      .slice(0, 4);
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
