"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { extractFromNoteV2, extractForPersonV2, applyPlanV2 } from "@/lib/nl-actions-v2";
import type {
  ExtractionV2,
  ConfirmedPlanV2,
  MentionResolution,
  PersonMention,
} from "@/lib/nl-types";
import { NLPreviewV2 } from "./nl-preview-v2";

type Phase =
  | { kind: "idle" }
  | { kind: "extracting" }
  | {
      kind: "preview";
      extraction: ExtractionV2;
      extractionId: string;
      resolutions: Record<string, MentionResolution>;
      supersedes: Record<number, string[]>;
    }
  | { kind: "applying" };

interface Props {
  /** When the dialog wraps this, it passes onClose to dismiss after success. */
  onClose?: () => void;
  /** Override for the textarea placeholder. */
  placeholder?: string;
  /** Smaller height variant for dashboard card. */
  compact?: boolean;
  /**
   * If set, the extraction treats this person as the implicit subject of any
   * subjectless statement in the note (used on the contact detail page).
   */
  subjectPersonId?: string;
}

function collectMentionsLocal(extraction: ExtractionV2): PersonMention[] {
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

function defaultResolution(m: PersonMention): MentionResolution {
  // confidence='high' → trust the LLM's first pick
  // confidence='medium' → still pre-pick the top candidate, user can override
  // confidence='low' → pre-pick top, but the UI surfaces the picker so user reviews
  if (m.candidate_ids.length > 0)
    return { kind: "existing", personId: m.candidate_ids[0] };
  if (m.proposed_new) return { kind: "new", person: m.proposed_new };
  return { kind: "skip" };
}

export function NLInput({ onClose, placeholder, compact, subjectPersonId }: Props) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const hydrate = useStore((s) => s.hydrate);

  async function onExtract() {
    if (!text.trim()) return;
    setPhase({ kind: "extracting" });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { extraction, extractionId } = subjectPersonId
        ? await extractForPersonV2(text, subjectPersonId, today)
        : await extractFromNoteV2(text, today);
      const mentions = collectMentionsLocal(extraction);
      const resolutions: Record<string, MentionResolution> = {};
      for (const m of mentions) resolutions[m.text] = defaultResolution(m);
      setPhase({ kind: "preview", extraction, extractionId, resolutions, supersedes: {} });
    } catch (err) {
      console.error(err);
      toast.error("Error extrayendo entidades", {
        description: err instanceof Error ? err.message : String(err),
      });
      setPhase({ kind: "idle" });
    }
  }

  async function onApply() {
    if (phase.kind !== "preview") return;
    const plan: ConfirmedPlanV2 = {
      noteText: text,
      resolutions: phase.resolutions,
      observations: phase.extraction.observations,
      events: phase.extraction.events,
      person_updates: phase.extraction.person_updates,
      supersedes: phase.supersedes,
    };
    setPhase({ kind: "applying" });
    try {
      const result = await applyPlanV2(plan, {
        extractionId: phase.extractionId,
        rawExtraction: phase.extraction,
      });
      await hydrate();
      const parts = [
        result.createdPeople.length && `${result.createdPeople.length} contactos`,
        result.createdObservationIds.length &&
          `${result.createdObservationIds.length} observaciones`,
        result.createdEvents.length && `${result.createdEvents.length} eventos`,
        result.updatedPersonIds.length && `${result.updatedPersonIds.length} actualizaciones`,
        result.supersededObservationIds.length &&
          `${result.supersededObservationIds.length} reemplazos`,
      ].filter(Boolean);
      toast.success("Aplicado", { description: parts.join(", ") || "Sin cambios" });
      setText("");
      setPhase({ kind: "idle" });
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error("Error aplicando los cambios", {
        description: err instanceof Error ? err.message : String(err),
      });
      setPhase({ kind: "idle" });
    }
  }

  function onDiscard() {
    setPhase({ kind: "idle" });
  }

  if (phase.kind === "preview") {
    return (
      <NLPreviewV2
        extraction={phase.extraction}
        resolutions={phase.resolutions}
        onChangeResolutions={(r) =>
          setPhase((p) => (p.kind === "preview" ? { ...p, resolutions: r } : p))
        }
        supersedes={phase.supersedes}
        onChangeSupersedes={(s) =>
          setPhase((p) => (p.kind === "preview" ? { ...p, supersedes: s } : p))
        }
        onApply={onApply}
        onDiscard={onDiscard}
        applying={false}
      />
    );
  }

  if (phase.kind === "applying") {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Aplicando...
      </div>
    );
  }

  const busy = phase.kind === "extracting";

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? "Hoy quedé con Pablo y me contó..."}
        className={compact ? "min-h-[88px]" : "min-h-[120px]"}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onExtract();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          Texto libre. Personas, hechos, promesas, contexto…
          <kbd className="ml-1 rounded border border-border bg-secondary px-1 text-[10px]">⌘↵</kbd>
          <span className="ml-1">o atajo global</span>
          <kbd className="ml-1 rounded border border-border bg-secondary px-1 text-[10px]">⌘⇧ J</kbd>
        </div>
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
              Cerrar
            </Button>
          )}
          <Button size="sm" onClick={onExtract} disabled={busy || !text.trim()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Procesar
          </Button>
        </div>
      </div>
    </div>
  );
}
