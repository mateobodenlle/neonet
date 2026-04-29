"use client";

import { useState } from "react";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { extractFromNote, extractForPerson, applyPlan } from "@/lib/nl-actions";
import type { Extraction, ConfirmedPlan, MentionResolution } from "@/lib/nl-types";
import { NLPreview } from "./nl-preview";

type Phase =
  | { kind: "idle" }
  | { kind: "extracting" }
  | { kind: "preview"; extraction: Extraction; resolutions: Record<string, MentionResolution> }
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

export function NLInput({ onClose, placeholder, compact, subjectPersonId }: Props) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const hydrate = useStore((s) => s.hydrate);

  async function onExtract() {
    if (!text.trim()) return;
    setPhase({ kind: "extracting" });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const extraction = subjectPersonId
        ? await extractForPerson(text, subjectPersonId, today)
        : await extractFromNote(text, today);
      // Default resolutions: take LLM's first suggestion per mention.
      const resolutions: Record<string, MentionResolution> = {};
      for (const m of extraction.mentions) {
        if (m.candidate_ids.length === 1) {
          resolutions[m.text] = { kind: "existing", personId: m.candidate_ids[0] };
        } else if (m.candidate_ids.length === 0 && m.proposed_new) {
          resolutions[m.text] = { kind: "new", person: m.proposed_new };
        } else if (m.candidate_ids.length > 1) {
          // Ambiguous — leave for the user. Default to the highest-ranked candidate.
          resolutions[m.text] = { kind: "existing", personId: m.candidate_ids[0] };
        } else {
          resolutions[m.text] = { kind: "skip" };
        }
      }
      setPhase({ kind: "preview", extraction, resolutions });
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
    const plan: ConfirmedPlan = {
      noteText: text,
      resolutions: phase.resolutions,
      encounters: phase.extraction.encounters,
      pain_points: phase.extraction.pain_points,
      promises: phase.extraction.promises,
      person_updates: phase.extraction.person_updates,
      connections: phase.extraction.connections,
      events: phase.extraction.events,
    };
    setPhase({ kind: "applying" });
    try {
      const result = await applyPlan(plan);
      // Refresh local store from server.
      await hydrate();
      const created = [
        result.createdPeople.length && `${result.createdPeople.length} contactos`,
        result.createdEncounters.length && `${result.createdEncounters.length} encuentros`,
        result.createdPainPoints.length && `${result.createdPainPoints.length} pain points`,
        result.createdPromises.length && `${result.createdPromises.length} compromisos`,
        result.createdEdges.length && `${result.createdEdges.length} conexiones`,
        result.updatedPeople.length && `${result.updatedPeople.length} actualizaciones`,
      ]
        .filter(Boolean)
        .join(", ");
      toast.success("Aplicado", { description: created || "Sin cambios" });
      setText("");
      setPhase({ kind: "idle" });
      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error("Error aplicando los cambios", {
        description: err instanceof Error ? err.message : String(err),
      });
      // Stay in preview so user can retry.
      if (phase.kind === ("applying" as Phase["kind"])) {
        setPhase({ kind: "idle" });
      }
    }
  }

  function onDiscard() {
    setPhase({ kind: "idle" });
  }

  if (phase.kind === "preview") {
    return (
      <NLPreview
        extraction={phase.extraction}
        resolutions={phase.resolutions}
        onChangeResolutions={(r) =>
          setPhase((p) => (p.kind === "preview" ? { ...p, resolutions: r } : p))
        }
        onApply={onApply}
        onDiscard={onDiscard}
        applying={(phase as Phase).kind === "applying"}
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
          Texto libre. Personas, encuentros, pain points, promesas...
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
