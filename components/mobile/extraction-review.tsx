"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  Trash2,
  AlertTriangle,
  User,
  UserPlus,
  MinusCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { collectMentions, defaultResolution, parseFacets } from "@/lib/extraction-plan";
import {
  applyExtraction as defaultApply,
  discardExtraction as defaultDiscard,
} from "@/lib/mobile-actions";
import type {
  ExtractionV2,
  ExtractedObservationV2,
  MentionResolution,
  PersonMention,
  ConfirmedPlanV2,
} from "@/lib/nl-types";
import type { MobilePerson } from "@/lib/mobile-types";
import { cn } from "@/lib/utils";

interface ApplyResultLike {
  createdPeople: unknown[];
  createdObservationIds: unknown[];
  createdEvents: unknown[];
  supersededObservationIds: unknown[];
}

interface Props {
  extractionId: string;
  noteText: string;
  extraction: ExtractionV2;
  people: MobilePerson[];
  /** Server actions inyectables (defaults: las reales). */
  applyAction?: (id: string, plan: ConfirmedPlanV2) => Promise<ApplyResultLike>;
  discardAction?: (id: string) => Promise<void>;
  /** Ruta a la que volver tras aplicar / descartar. */
  pendingHref?: string;
}

export function ExtractionReview({
  extractionId,
  noteText,
  extraction,
  people,
  applyAction = defaultApply,
  discardAction = defaultDiscard,
  pendingHref = "/m/pending",
}: Props) {
  const router = useRouter();

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const mentions = useMemo(() => collectMentions(extraction), [extraction]);

  const [resolutions, setResolutions] = useState<Record<string, MentionResolution>>(() => {
    const init: Record<string, MentionResolution> = {};
    for (const m of mentions) init[m.text] = defaultResolution(m);
    return init;
  });
  const [supersedes, setSupersedes] = useState<Record<number, string[]>>({});
  const [submitting, setSubmitting] = useState<"apply" | "discard" | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  function setResolution(text: string, r: MentionResolution) {
    setResolutions((prev) => ({ ...prev, [text]: r }));
  }

  function nameForText(text: string): string {
    const r = resolutions[text];
    if (!r || r.kind === "skip") return text;
    if (r.kind === "new") return r.person.full_name;
    return peopleById.get(r.personId)?.full_name ?? text;
  }

  function isIncluded(text: string): boolean {
    const r = resolutions[text];
    return !!r && r.kind !== "skip";
  }

  async function onApply() {
    if (submitting) return;
    setSubmitting("apply");
    const plan: ConfirmedPlanV2 = {
      noteText,
      resolutions,
      observations: extraction.observations,
      events: extraction.events,
      person_updates: extraction.person_updates,
      supersedes,
    };
    try {
      const result = await applyAction(extractionId, plan);
      const parts = [
        result.createdPeople.length && `${result.createdPeople.length} contactos`,
        result.createdObservationIds.length && `${result.createdObservationIds.length} obs`,
        result.createdEvents.length && `${result.createdEvents.length} eventos`,
        result.supersededObservationIds.length && `${result.supersededObservationIds.length} reemplazos`,
      ].filter(Boolean);
      toast.success("Aplicado", {
        description: parts.join(", ") || "Sin cambios",
      });
      router.replace(pendingHref);
      router.refresh();
    } catch (e) {
      toast.error("Error al aplicar", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmitting(null);
    }
  }

  async function onConfirmDiscard() {
    if (submitting) return;
    setSubmitting("discard");
    setConfirmingDiscard(false);
    try {
      await discardAction(extractionId);
      toast.success("Nota descartada");
      router.replace(pendingHref);
      router.refresh();
    } catch (e) {
      toast.error("Error al descartar", {
        description: e instanceof Error ? e.message : String(e),
      });
      setSubmitting(null);
    }
  }

  return (
    <>
      <div className="space-y-5">
        {/* Nota original */}
        <Section title="Nota original">
          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">
            {noteText}
          </div>
        </Section>

        {/* Warnings */}
        {extraction.warnings?.length > 0 && (
          <div className="space-y-1.5">
            {extraction.warnings.map((w, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Personas mencionadas */}
        {mentions.length > 0 && (
          <Section title={`Personas mencionadas (${mentions.length})`}>
            <div className="space-y-2.5">
              {mentions.map((m) => (
                <MentionCard
                  key={m.text}
                  mention={m}
                  resolution={resolutions[m.text]}
                  peopleById={peopleById}
                  onSet={(r) => setResolution(m.text, r)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Observaciones */}
        {extraction.observations?.length > 0 && (
          <Section title={`Observaciones (${extraction.observations.length})`}>
            <div className="space-y-2">
              {extraction.observations.map((o, i) => (
                <ObservationCard
                  key={i}
                  observation={o}
                  index={i}
                  skipped={!isIncluded(o.primary_mention.text)}
                  nameForText={nameForText}
                  supersedesIds={supersedes[i] ?? []}
                  onChangeSupersedes={(ids) =>
                    setSupersedes((prev) => ({ ...prev, [i]: ids }))
                  }
                />
              ))}
            </div>
          </Section>
        )}

        {/* Person updates */}
        {extraction.person_updates?.length > 0 && (
          <Section title="Actualizaciones de campos">
            <div className="space-y-2">
              {extraction.person_updates.map((u, i) => {
                const skipped = !isIncluded(u.primary_mention.text);
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border border-border bg-card px-3 py-2 text-[13px]",
                      skipped && "opacity-40",
                    )}
                  >
                    <strong>{nameForText(u.primary_mention.text)}</strong>
                    <span className="text-muted-foreground"> · {u.field}: </span>
                    {u.new_value}
                    {skipped && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        (la persona referenciada está en &quot;ignorar&quot;)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Eventos */}
        {extraction.events?.length > 0 && (
          <Section title="Eventos">
            <div className="space-y-2">
              {extraction.events.map((e, i) => (
                <div key={i} className="rounded-md border border-border bg-card px-3 py-2 text-[13px]">
                  <strong>{e.name}</strong>
                  <span className="text-muted-foreground"> · {e.date}</span>
                  {e.location && <span className="text-muted-foreground"> · {e.location}</span>}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-2 px-4 py-3">
          <Button
            variant="outline"
            className="h-12 flex-1"
            disabled={!!submitting}
            onClick={() => setConfirmingDiscard(true)}
          >
            <Trash2 className="h-4 w-4" />
            Descartar
          </Button>
          <Button
            className="h-12 flex-1"
            disabled={!!submitting}
            onClick={onApply}
          >
            {submitting === "apply" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Aplicar
          </Button>
        </div>
      </div>

      {confirmingDiscard && (
        <DiscardConfirm
          onCancel={() => setConfirmingDiscard(false)}
          onConfirm={onConfirmDiscard}
        />
      )}
    </>
  );
}

// ---------- subcomponents ----------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

function MentionCard({
  mention,
  resolution,
  peopleById,
  onSet,
}: {
  mention: PersonMention;
  resolution: MentionResolution | undefined;
  peopleById: Map<string, MobilePerson>;
  onSet: (r: MentionResolution) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const conf = mention.confidence ?? "medium";
  const topId = mention.candidate_ids[0];
  const restIds = mention.candidate_ids.slice(1);
  const proposed = mention.proposed_new;

  const isExisting = (id: string) =>
    resolution?.kind === "existing" && resolution.personId === id;
  const isNew = resolution?.kind === "new";
  const isSkip = !resolution || resolution.kind === "skip";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3 py-3",
        conf === "low" ? "border-amber-500/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 text-[14px] font-medium">
        <span>&quot;{mention.text}&quot;</span>
        <ConfidenceBadge confidence={conf} />
      </div>

      <div className="mt-3 space-y-1.5">
        {topId && (
          <ChoiceButton
            selected={isExisting(topId)}
            icon={<User className="h-4 w-4" />}
            label={peopleById.get(topId)?.full_name ?? topId.slice(0, 8)}
            sub={[peopleById.get(topId)?.role, peopleById.get(topId)?.company]
              .filter(Boolean)
              .join(" · ") || undefined}
            onClick={() => onSet({ kind: "existing", personId: topId })}
          />
        )}

        {showAll &&
          restIds.map((id) => (
            <ChoiceButton
              key={id}
              selected={isExisting(id)}
              icon={<User className="h-4 w-4" />}
              label={peopleById.get(id)?.full_name ?? id.slice(0, 8)}
              sub={[peopleById.get(id)?.role, peopleById.get(id)?.company]
                .filter(Boolean)
                .join(" · ") || undefined}
              onClick={() => onSet({ kind: "existing", personId: id })}
            />
          ))}

        {restIds.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {showAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showAll ? "Ocultar" : `Ver ${restIds.length} alternativas más`}
          </button>
        )}

        {proposed && (
          <ChoiceButton
            selected={isNew}
            icon={<UserPlus className="h-4 w-4" />}
            label={`Crear "${proposed.full_name}"`}
            sub={[proposed.role, proposed.company].filter(Boolean).join(" · ") || undefined}
            onClick={() => onSet({ kind: "new", person: proposed })}
          />
        )}

        <ChoiceButton
          selected={isSkip}
          icon={<MinusCircle className="h-4 w-4" />}
          label="Ignorar esta mención"
          onClick={() => onSet({ kind: "skip" })}
        />
      </div>
    </div>
  );
}

function ChoiceButton({
  selected,
  icon,
  label,
  sub,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md border px-3 py-2.5 text-left text-[13px] transition-colors",
        selected
          ? "border-accent bg-accent/10 text-foreground"
          : "border-border bg-background hover:bg-secondary/40",
      )}
    >
      <span className={cn("mt-0.5", selected ? "text-accent" : "text-muted-foreground")}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub && <span className="block truncate text-[11px] text-muted-foreground">{sub}</span>}
      </span>
      {selected && <Check className="mt-0.5 h-4 w-4 text-accent" />}
    </button>
  );
}

function ObservationCard({
  observation,
  index,
  skipped,
  nameForText,
  supersedesIds,
  onChangeSupersedes,
}: {
  observation: ExtractedObservationV2;
  index: number;
  skipped: boolean;
  nameForText: (text: string) => string;
  supersedesIds: string[];
  onChangeSupersedes: (ids: string[]) => void;
}) {
  const facets = parseFacets(observation.facets.raw);
  const facetType = typeof facets.type === "string" ? facets.type : null;
  const hint = observation.supersedes_hint;
  void index; // index recibido para keys; ya no se usa internamente.

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-3 py-2.5 text-[13px]",
        skipped && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Calendar className="h-3 w-3" />
        {observation.observed_at}
        {facetType && (
          <Badge variant="default" className="ml-1 text-[10px]">
            {facetType}
          </Badge>
        )}
        {skipped && (
          <Badge variant="default" className="ml-auto text-[10px]">
            saltada
          </Badge>
        )}
      </div>
      <div className="mt-1.5 leading-relaxed">
        <strong>{nameForText(observation.primary_mention.text)}</strong>: {observation.content}
      </div>

      {observation.participants.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {observation.participants.map((p, k) => (
            <span key={k}>
              <span className="opacity-60">{p.role}</span>{" "}
              <span className="text-foreground">{nameForText(p.mention.text)}</span>
            </span>
          ))}
        </div>
      )}

      {observation.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {observation.tags.map((t) => (
            <Badge key={t} variant="default" className="text-[10px]">
              #{t}
            </Badge>
          ))}
        </div>
      )}

      {hint && hint.candidate_observation_ids.length > 0 && (
        <div className="mt-2 rounded border border-blue-500/30 bg-blue-500/5 px-2 py-1.5 text-[11px]">
          <div className="text-blue-600 dark:text-blue-400">Posible reemplazo: {hint.reason}</div>
          <div className="mt-1.5 space-y-1">
            {hint.candidate_observation_ids.map((oid) => {
              const checked = supersedesIds.includes(oid);
              return (
                <label
                  key={oid}
                  className={cn(
                    "flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer",
                    checked ? "border-blue-500 bg-blue-500/10" : "border-border bg-background",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...supersedesIds, oid]
                        : supersedesIds.filter((x) => x !== oid);
                      onChangeSupersedes(next);
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
}

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const styles =
    confidence === "high"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : confidence === "medium"
      ? "border-border bg-secondary/60 text-muted-foreground"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";
  const label = confidence === "high" ? "alta" : confidence === "medium" ? "media" : "baja";
  return (
    <span className={cn("inline-flex rounded border px-1 py-0 text-[10px] uppercase tracking-wide", styles)}>
      {label}
    </span>
  );
}

function DiscardConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">¿Descartar esta nota?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          La nota se marcará como descartada. No se aplicará nada al CRM.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1 h-11" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="destructive" className="flex-1 h-11" onClick={onConfirm}>
            Descartar
          </Button>
        </div>
      </div>
    </div>
  );
}
