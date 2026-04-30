"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Loader2,
  AlertTriangle,
  UserPlus,
  User,
  MinusCircle,
  Calendar,
  Search,
  ListTree,
  ArrowRightLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/utils";
import type { Person } from "@/lib/types";
import type {
  ExtractionV2,
  ExtractedObservationV2,
  MentionResolution,
  PersonMention,
} from "@/lib/nl-types";

interface Props {
  extraction: ExtractionV2;
  resolutions: Record<string, MentionResolution>;
  onChangeResolutions: (r: Record<string, MentionResolution>) => void;
  /** index → confirmed superseded observation ids, edited inline. */
  supersedes: Record<number, string[]>;
  onChangeSupersedes: (s: Record<number, string[]>) => void;
  onApply: () => void;
  onDiscard: () => void;
  applying: boolean;
}

function collectMentions(extraction: ExtractionV2): PersonMention[] {
  const byText = new Map<string, PersonMention>();
  const add = (m: PersonMention) => {
    if (!byText.has(m.text)) byText.set(m.text, m);
  };
  for (const o of extraction.observations) {
    add(o.primary_mention);
    for (const p of o.participants) add(p.mention);
  }
  for (const u of extraction.person_updates) add(u.primary_mention);
  return [...byText.values()];
}

export function NLPreviewV2({
  extraction,
  resolutions,
  onChangeResolutions,
  supersedes,
  onChangeSupersedes,
  onApply,
  onDiscard,
  applying,
}: Props) {
  const people = useStore((s) => s.people);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const mentions = useMemo(() => collectMentions(extraction), [extraction]);

  function setResolution(text: string, r: MentionResolution) {
    onChangeResolutions({ ...resolutions, [text]: r });
  }

  function nameForText(text: string): string {
    const r = resolutions[text];
    if (!r || r.kind === "skip") return text;
    if (r.kind === "new") return r.person.full_name;
    return peopleById.get(r.personId)?.fullName ?? text;
  }

  function isIncluded(text: string): boolean {
    const r = resolutions[text];
    return !!r && r.kind !== "skip";
  }

  function obsSkipped(o: ExtractedObservationV2): boolean {
    return !isIncluded(o.primary_mention.text);
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
            <div
              key={i}
              className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* mentions */}
      {mentions.length > 0 && (
        <Section title="Personas mencionadas">
          {mentions.map((m) => {
            const r = resolutions[m.text];
            const conf = m.confidence ?? "medium";
            return (
              <div
                key={m.text}
                className={`rounded-md border bg-card px-3 py-2.5 ${
                  conf === "low"
                    ? "border-amber-500/40"
                    : conf === "medium"
                    ? "border-border"
                    : "border-border/50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[13px] font-medium">
                    &quot;{m.text}&quot;
                    <ConfidenceBadge confidence={conf} />
                  </div>
                  <ResolutionPills
                    resolution={r}
                    candidateIds={m.candidate_ids}
                    proposedName={m.proposed_new?.full_name}
                    onSet={(next) => setResolution(m.text, next)}
                  />
                </div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">
                  {r?.kind === "existing" && peopleById.get(r.personId) && (
                    <>
                      <User className="inline h-3 w-3 mr-1" />
                      Asociar a{" "}
                      <span className="text-foreground">{peopleById.get(r.personId)!.fullName}</span>
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
                {conf !== "high" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {m.candidate_ids.length > 1 &&
                      m.candidate_ids.map((id) => {
                        const p = peopleById.get(id);
                        const selected = r?.kind === "existing" && r.personId === id;
                        return (
                          <button
                            key={id}
                            onClick={() =>
                              setResolution(m.text, { kind: "existing", personId: id })
                            }
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
                      onPick={(id) =>
                        setResolution(m.text, { kind: "existing", personId: id })
                      }
                    />
                  </div>
                )}
                {conf === "high" && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Asignación automática.{" "}
                    <button
                      className="underline hover:text-foreground"
                      onClick={() => setResolution(m.text, { kind: "skip" })}
                    >
                      cambiar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* observations */}
      {extraction.observations.length > 0 && (
        <Section title="Observaciones" icon={<ListTree className="h-3.5 w-3.5" />}>
          {extraction.observations.map((o, i) => {
            const skipped = obsSkipped(o);
            const facets = parseFacets(o.facets.raw);
            const facetType = (facets.type as string) ?? null;
            const supersedesIds = supersedes[i] ?? [];
            const hint = o.supersedes_hint;
            return (
              <div
                key={i}
                className={`rounded-md border border-border bg-card px-3 py-2 text-[13px] ${
                  skipped ? "opacity-40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(o.observed_at)}
                      {facetType && (
                        <Badge variant="default" className="ml-1">
                          {facetType}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1">
                      <strong>{nameForText(o.primary_mention.text)}</strong>: {o.content}
                    </div>
                    {o.participants.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {o.participants.map((p, k) => (
                          <span key={k} className="mr-2">
                            <span className="opacity-60">{p.role}</span>{" "}
                            <span>{nameForText(p.mention.text)}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {o.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {o.tags.map((t, k) => (
                          <Badge key={k} variant="default" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {Object.keys(facets).filter((k) => k !== "type").length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground font-mono">
                        {JSON.stringify(facets)}
                      </div>
                    )}
                  </div>
                </div>
                {hint && hint.candidate_observation_ids.length > 0 && (
                  <div className="mt-2 rounded border border-blue-500/30 bg-blue-500/5 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <ArrowRightLeft className="h-3 w-3" />
                      Posible reemplazo: {hint.reason}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {hint.candidate_observation_ids.map((oid) => {
                        const checked = supersedesIds.includes(oid);
                        return (
                          <label
                            key={oid}
                            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 cursor-pointer ${
                              checked
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-border bg-background"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...supersedesIds, oid]
                                  : supersedesIds.filter((x) => x !== oid);
                                onChangeSupersedes({ ...supersedes, [i]: next });
                              }}
                            />
                            <code className="text-[10px]">{oid.slice(0, 8)}</code>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {extraction.person_updates.length > 0 && (
        <Section title="Actualizaciones de campos">
          {extraction.person_updates.map((u, i) => {
            const skipped = !isIncluded(u.primary_mention.text);
            return (
              <FactRow key={i} skipped={skipped}>
                <strong>{nameForText(u.primary_mention.text)}</strong> → {u.field}: {u.new_value}
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

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles =
    confidence === "high"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : confidence === "medium"
      ? "border-border bg-secondary/60 text-muted-foreground"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  const label =
    confidence === "high" ? "alta" : confidence === "medium" ? "media" : "baja";
  return (
    <span
      className={`inline-flex items-center rounded border px-1 py-0 text-[10px] uppercase tracking-wide ${styles}`}
    >
      {label}
    </span>
  );
}

function parseFacets(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
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
          (la persona referenciada está en &quot;ignorar&quot;)
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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1 rounded border border-dashed border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/60">
          <Search className="h-3 w-3" />
          Buscar contacto…
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command loop>
          <CommandInput placeholder="Nombre, empresa, alias…" autoFocus />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            {people
              .filter((p) => !p.archived)
              .map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.fullName} ${p.company ?? ""} ${p.role ?? ""} ${(p.aliases ?? []).join(" ")} ${(p.tags ?? []).join(" ")}`}
                  onSelect={() => {
                    onPick(p.id);
                    setOpen(false);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{p.fullName}</div>
                    {(p.company || p.role) && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {[p.role, p.company].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  {p.id === selectedId && <Check className="h-3 w-3 text-accent" />}
                </CommandItem>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
