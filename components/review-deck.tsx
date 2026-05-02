"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Combine,
  ExternalLink,
  Undo2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStore } from "@/lib/store";
import { foldText } from "@/lib/utils";
import {
  acceptCandidateAction,
  rejectCandidateAction,
  mergeCandidateAction,
  undoCandidateAction,
  type ConnectionCandidate,
} from "@/lib/candidate-actions";
import type { Person } from "@/lib/types";

type Action = "accepted" | "rejected" | "merged";

export function ReviewDeck({
  initialCandidates,
  initialStats,
}: {
  initialCandidates: ConnectionCandidate[];
  initialStats: { pending: number; accepted: number; rejected: number; merged: number };
}) {
  const people = useStore((s) => s.people);
  const setStore = useStore.setState;

  const [queue, setQueue] = useState<ConnectionCandidate[]>(initialCandidates);
  const [index, setIndex] = useState(0);
  const [undoStack, setUndoStack] = useState<
    Array<{ candidateId: string; action: Action }>
  >([]);
  const [stats, setStats] = useState(initialStats);
  const [busy, setBusy] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const current = queue[index];
  const remaining = queue.length - index;

  const advance = useCallback(
    (action: Action, candidateId: string) => {
      setUndoStack((s) => [...s, { candidateId, action }]);
      setIndex((i) => i + 1);
      setStats((s) => ({ ...s, pending: Math.max(0, s.pending - 1), [action]: s[action] + 1 }));
    },
    []
  );

  const onAccept = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const { person } = await acceptCandidateAction(current.id);
      setStore((s) => ({ people: [person, ...s.people] }));
      advance("accepted", current.id);
      toast.success(`Aceptado · ${current.fullName}`);
    } catch (err) {
      toast.error("No se pudo aceptar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [current, busy, advance, setStore]);

  const onReject = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await rejectCandidateAction(current.id);
      advance("rejected", current.id);
    } catch (err) {
      toast.error("No se pudo rechazar", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [current, busy, advance]);

  const onMerge = useCallback(
    async (target: Person) => {
      if (!current || busy) return;
      setBusy(true);
      try {
        const { person } = await mergeCandidateAction(current.id, target.id);
        setStore((s) => ({
          people: s.people.map((p) => (p.id === person.id ? person : p)),
        }));
        advance("merged", current.id);
        setMergeOpen(false);
        toast.success(`Fusionado en ${person.fullName}`);
      } catch (err) {
        toast.error("No se pudo fusionar", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setBusy(false);
      }
    },
    [current, busy, advance, setStore]
  );

  const onUndo = useCallback(async () => {
    if (busy) return;
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const restored = await undoCandidateAction(last.candidateId);
      setUndoStack((s) => s.slice(0, -1));
      setIndex((i) => Math.max(0, i - 1));
      setQueue((q) => {
        const without = q.filter((c) => c.id !== restored.id);
        const insertAt = Math.max(0, index - 1);
        return [...without.slice(0, insertAt), restored, ...without.slice(insertAt)];
      });
      setStats((s) => ({
        ...s,
        pending: s.pending + 1,
        [last.action]: Math.max(0, s[last.action] - 1),
      }));
      // If accept-undo deleted a person, remove it from the store too.
      if (last.action === "accepted" && restored.createdPersonId) {
        setStore((s) => ({
          people: s.people.filter((p) => p.id !== restored.createdPersonId),
        }));
      }
      toast.message("Deshecho");
    } catch (err) {
      toast.error("No se pudo deshacer", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [busy, undoStack, index, setStore]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target && (e.target as HTMLElement).matches("input, textarea, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onAccept();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onReject();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setMergeOpen((v) => !v);
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        onUndo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAccept, onReject, onUndo]);

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <div className="text-lg font-medium">No quedan conexiones por revisar</div>
        <p className="max-w-md text-[13px] text-muted-foreground">
          Todas tus conexiones de LinkedIn están clasificadas. Aceptadas:{" "}
          <strong>{stats.accepted}</strong> · Rechazadas: <strong>{stats.rejected}</strong> ·
          Fusionadas: <strong>{stats.merged}</strong>.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/contacts">Volver a contactos</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
        <span>
          <strong className="text-foreground">{remaining}</strong> por revisar
        </span>
        <span className="flex items-center gap-3">
          <span>✓ {stats.accepted}</span>
          <span>✕ {stats.rejected}</span>
          <span>⤺ {stats.merged}</span>
        </span>
      </div>

      <CandidateCard candidate={current} />

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" onClick={onReject} disabled={busy} className="min-w-[140px]">
          <ArrowLeft className="h-4 w-4" />
          Rechazar
        </Button>

        <MergeButton
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          people={people}
          candidate={current}
          onMerge={onMerge}
          disabled={busy}
        />

        <Button onClick={onAccept} disabled={busy} className="min-w-[140px]">
          Aceptar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Atajos: <kbd className="rounded border px-1">←</kbd> rechazar ·{" "}
          <kbd className="rounded border px-1">→</kbd> aceptar ·{" "}
          <kbd className="rounded border px-1">M</kbd> fusionar ·{" "}
          <kbd className="rounded border px-1">U</kbd> deshacer
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={busy || undoStack.length === 0}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Deshacer
        </Button>
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: ConnectionCandidate }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight">
            {candidate.fullName}
          </h2>
          {(candidate.position || candidate.company) && (
            <p className="mt-1 text-[14px] text-muted-foreground">
              {candidate.position}
              {candidate.position && candidate.company ? " · " : ""}
              {candidate.company}
            </p>
          )}
        </div>
        <a
          href={candidate.linkedinUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-secondary/50 px-2 py-1 text-[12px] hover:bg-secondary"
        >
          LinkedIn
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
        {candidate.email && (
          <Field label="Email" value={candidate.email} />
        )}
        {candidate.linkedinHandle && (
          <Field label="Handle" value={candidate.linkedinHandle} mono />
        )}
        {candidate.connectedOn && (
          <Field label="Conectaste" value={formatDate(candidate.connectedOn)} />
        )}
      </dl>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`truncate ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function MergeButton({
  open,
  onOpenChange,
  people,
  candidate,
  onMerge,
  disabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  people: Person[];
  candidate: ConnectionCandidate;
  onMerge: (p: Person) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");

  // Suggest matches by shared first name or token overlap.
  const suggestions = useMemo(() => {
    const candTokens = new Set(
      foldText(candidate.fullName)
        .split(/\s+/)
        .filter((t) => t.length >= 3)
    );
    const scored = people
      .filter((p) => !p.archived)
      .map((p) => {
        const pt = new Set(foldText(p.fullName).split(/\s+/).filter(Boolean));
        let overlap = 0;
        for (const t of candTokens) if (pt.has(t)) overlap++;
        return { p, overlap };
      })
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 6)
      .map((x) => x.p);
    return scored;
  }, [candidate.fullName, people]);

  const filtered = useMemo(() => {
    const needle = foldText(q.trim());
    if (!needle) return suggestions;
    return people
      .filter((p) => !p.archived)
      .filter((p) =>
        foldText(
          [p.fullName, p.role, p.company, ...(p.aliases ?? [])]
            .filter(Boolean)
            .join(" ")
        ).includes(needle)
      )
      .slice(0, 30);
  }, [q, people, suggestions]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="secondary" disabled={disabled} className="min-w-[140px]">
          <Combine className="h-4 w-4" />
          Fusionar
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-2" align="center">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar contacto…"
          className="h-8"
        />
        <ScrollArea className="mt-2 h-[280px]">
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-[12px] text-muted-foreground">
              {q ? "Sin resultados" : "Escribe para buscar un contacto"}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => onMerge(p)}
                    className="flex w-full flex-col items-start rounded px-2 py-1.5 text-left hover:bg-secondary"
                  >
                    <span className="truncate text-[13px] font-medium">{p.fullName}</span>
                    {(p.role || p.company) && (
                      <span className="truncate text-[11px] text-muted-foreground">
                        {p.role}
                        {p.role && p.company ? " · " : ""}
                        {p.company}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function NoCandidatesEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-12 text-center">
      <XCircle className="h-10 w-10 text-muted-foreground" />
      <div className="text-lg font-medium">Aún no hay candidatos importados</div>
      <p className="max-w-md text-[13px] text-muted-foreground">
        Corre <code className="rounded bg-secondary px-1">npm run import:linkedin-candidates</code>{" "}
        con tu Connections.csv para llenar la cola.
      </p>
    </div>
  );
}
