"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, AlertTriangle, UserPlus, User, MinusCircle, Calendar, Flame, Handshake, Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { formatDate, foldText } from "@/lib/utils";
import type { Person } from "@/lib/types";
import type { Extraction, MentionResolution } from "@/lib/nl-types";

interface Props {
  extraction: Extraction;
  resolutions: Record<string, MentionResolution>;
  onChangeResolutions: (r: Record<string, MentionResolution>) => void;
  onApply: () => void;
  onDiscard: () => void;
  applying: boolean;
}

export function NLPreview({ extraction, resolutions, onChangeResolutions, onApply, onDiscard, applying }: Props) {
  const people = useStore((s) => s.people);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  function set(text: string, r: MentionResolution) {
    onChangeResolutions({ ...resolutions, [text]: r });
  }

  const includedTexts = new Set(
    Object.entries(resolutions)
      .filter(([, r]) => r.kind !== "skip")
      .map(([t]) => t)
  );

  function nameForText(text: string): string {
    const r = resolutions[text];
    if (!r || r.kind === "skip") return text;
    if (r.kind === "new") return r.person.full_name;
    return peopleById.get(r.personId)?.fullName ?? text;
  }

  return (
    <div className="space-y-5">
      {extraction.summary && (
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-[13px] text-muted-foreground">
          {extraction.summary}
        </div>
      )}

      {extraction.warnings.length > 0 && (
        <div className="space-y-1">
          {extraction.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* mentions */}
      {extraction.mentions.length > 0 && (
        <Section title="Personas mencionadas">
          {extraction.mentions.map((m) => {
            const r = resolutions[m.text];
            return (
              <div key={m.text} className="rounded-md border border-border bg-card px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-medium">"{m.text}"</div>
                  <ResolutionPills
                    resolution={r}
                    candidateIds={m.candidate_ids}
                    proposedName={m.proposed_new?.full_name}
                    onSet={(next) => set(m.text, next)}
                  />
                </div>
                {/* Detail of current selection */}
                <div className="mt-1.5 text-[12px] text-muted-foreground">
                  {r?.kind === "existing" && peopleById.get(r.personId) && (
                    <>
                      <User className="inline h-3 w-3 mr-1" />
                      Asociar a <span className="text-foreground">{peopleById.get(r.personId)!.fullName}</span>
                      {peopleById.get(r.personId)!.company && ` · ${peopleById.get(r.personId)!.company}`}
                    </>
                  )}
                  {r?.kind === "new" && (
                    <>
                      <UserPlus className="inline h-3 w-3 mr-1" />
                      Crear nuevo: <span className="text-foreground">{r.person.full_name}</span>
                      {r.person.role && ` · ${r.person.role}`}
                      {r.person.company && ` · ${r.person.company}`}
                    </>
                  )}
                  {r?.kind === "skip" && (
                    <>
                      <MinusCircle className="inline h-3 w-3 mr-1" />
                      Ignorar esta mención
                    </>
                  )}
                </div>

                {/* Candidate quick-pick (when LLM proposed >1) + always-available "search any contact" picker */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {m.candidate_ids.length > 1 &&
                    m.candidate_ids.map((id) => {
                      const p = peopleById.get(id);
                      const selected = r?.kind === "existing" && r.personId === id;
                      return (
                        <button
                          key={id}
                          onClick={() => set(m.text, { kind: "existing", personId: id })}
                          className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
                            selected
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-border bg-background hover:bg-secondary/60"
                          }`}
                        >
                          {p?.fullName ?? id.slice(0, 8)}
                          {p?.company && <span className="text-muted-foreground"> · {p.company}</span>}
                        </button>
                      );
                    })}
                  <DirectoryPicker
                    people={people}
                    selectedId={r?.kind === "existing" ? r.personId : undefined}
                    onPick={(id) => set(m.text, { kind: "existing", personId: id })}
                  />
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* facts */}
      {extraction.encounters.length > 0 && (
        <Section title="Encuentros" icon={<Calendar className="h-3.5 w-3.5" />}>
          {extraction.encounters.map((e, i) => {
            const skipped = !includedTexts.has(e.person_text);
            return (
              <FactRow key={i} skipped={skipped}>
                <strong>{nameForText(e.person_text)}</strong>
                {" · "}
                {formatDate(e.date)}
                {e.location && ` · ${e.location}`}
                {e.event_name && ` · evento ${e.event_name}`}
                <div className="text-muted-foreground">{e.context}</div>
              </FactRow>
            );
          })}
        </Section>
      )}

      {extraction.pain_points.length > 0 && (
        <Section title="Pain points" icon={<Flame className="h-3.5 w-3.5" />}>
          {extraction.pain_points.map((pp, i) => {
            const skipped = !includedTexts.has(pp.person_text);
            return (
              <FactRow key={i} skipped={skipped}>
                <strong>{nameForText(pp.person_text)}</strong>: {pp.description}
              </FactRow>
            );
          })}
        </Section>
      )}

      {extraction.promises.length > 0 && (
        <Section title="Compromisos" icon={<Handshake className="h-3.5 w-3.5" />}>
          {extraction.promises.map((pr, i) => {
            const allTexts = [pr.person_text, ...(pr.also_person_texts ?? [])];
            const skipped = !allTexts.some((t) => includedTexts.has(t));
            const names = allTexts.map(nameForText).filter(Boolean);
            return (
              <FactRow key={i} skipped={skipped}>
                <Badge variant={pr.direction === "yo-a-el" ? "accent" : "default"}>
                  {pr.direction === "yo-a-el" ? "yo → él" : "él → yo"}
                </Badge>{" "}
                <strong>{names.join(", ")}</strong>: {pr.description}
                {pr.due_date && <span className="text-muted-foreground"> · vence {formatDate(pr.due_date)}</span>}
                {names.length > 1 && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Una sola promesa para {names.length} personas. Al marcarla como hecha se cierra para todos.
                  </div>
                )}
              </FactRow>
            );
          })}
        </Section>
      )}

      {extraction.person_updates.length > 0 && (
        <Section title="Actualizaciones">
          {extraction.person_updates.map((u, i) => {
            const skipped = !includedTexts.has(u.person_text);
            return (
              <FactRow key={i} skipped={skipped}>
                <strong>{nameForText(u.person_text)}</strong> → {u.field}: {u.new_value}
              </FactRow>
            );
          })}
        </Section>
      )}

      {extraction.connections.length > 0 && (
        <Section title="Conexiones" icon={<Link2 className="h-3.5 w-3.5" />}>
          {extraction.connections.map((c, i) => {
            const skipped = !includedTexts.has(c.from_person_text) || !includedTexts.has(c.to_person_text);
            return (
              <FactRow key={i} skipped={skipped}>
                <strong>{nameForText(c.from_person_text)}</strong>
                {" "}
                <span className="text-muted-foreground">{c.kind}</span>
                {" "}
                <strong>{nameForText(c.to_person_text)}</strong>
                {c.note && <span className="text-muted-foreground"> · {c.note}</span>}
              </FactRow>
            );
          })}
        </Section>
      )}

      {extraction.events.length > 0 && (
        <Section title="Eventos">
          {extraction.events.map((e, i) => (
            <FactRow key={i}>
              <strong>{e.name}</strong> · {formatDate(e.date)}
              {e.location && ` · ${e.location}`}
            </FactRow>
          ))}
        </Section>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={applying}>
          Descartar
        </Button>
        <Button size="sm" onClick={onApply} disabled={applying}>
          {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FactRow({ skipped, children }: { skipped?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md border border-border bg-card px-3 py-2 text-[13px] ${
        skipped ? "opacity-40" : ""
      }`}
    >
      {children}
      {skipped && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          (la persona referenciada está en "ignorar")
        </div>
      )}
    </div>
  );
}

function ResolutionPills({
  resolution,
  candidateIds,
  proposedName,
  onSet,
}: {
  resolution: MentionResolution | undefined;
  candidateIds: string[];
  proposedName: string | undefined;
  onSet: (r: MentionResolution) => void;
}) {
  const r = resolution;
  return (
    <div className="flex items-center gap-1">
      {candidateIds.length > 0 && (
        <Pill
          active={r?.kind === "existing"}
          onClick={() => candidateIds[0] && onSet({ kind: "existing", personId: candidateIds[0] })}
          icon={<User className="h-3 w-3" />}
          label="Existente"
        />
      )}
      {proposedName && (
        <Pill
          active={r?.kind === "new"}
          onClick={() =>
            onSet({
              kind: "new",
              person: { full_name: proposedName, role: null, company: null, notes: null },
            })
          }
          icon={<UserPlus className="h-3 w-3" />}
          label="Nuevo"
        />
      )}
      <Pill
        active={r?.kind === "skip"}
        onClick={() => onSet({ kind: "skip" })}
        icon={<MinusCircle className="h-3 w-3" />}
        label="Ignorar"
      />
    </div>
  );
}

function Pill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-background text-muted-foreground hover:bg-secondary/60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** Searchable picker over the full directory, used to override the LLM's
 *  per-mention resolution when none of the candidates match. */
function DirectoryPicker({
  people,
  selectedId,
  onPick,
}: {
  people: Person[];
  selectedId: string | undefined;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const active = people.filter((p) => !p.archived);
  const q = foldText(query.trim());
  const filtered = q
    ? active.filter((p) =>
        foldText(
          `${p.fullName} ${p.company ?? ""} ${p.role ?? ""} ${(p.aliases ?? []).join(" ")}`
        ).includes(q)
      )
    : active;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/60">
          <Search className="h-3 w-3" />
          Buscar contacto…
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[300px] p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          placeholder="Nombre, empresa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-8 text-[13px]"
        />
        <div className="max-h-[220px] overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <div className="py-4 text-center text-[12px] text-muted-foreground">Sin resultados.</div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-secondary/70 ${
                p.id === selectedId ? "bg-accent/10 text-accent" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(p.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <div className="min-w-0">
                <div className="truncate text-[13px]">{p.fullName}</div>
                {(p.company || p.role) && (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {[p.role, p.company].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              {p.id === selectedId && <Check className="h-3 w-3 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
