"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/utils";
import {
  fetchPromiseObservations,
  togglePromiseDone,
  type PromiseItem,
} from "@/lib/promise-actions";

type Filter = "all" | "today" | "week" | "overdue";

const UNDO_MS = 15_000;

export function PendientesCard() {
  const [items, setItems] = useState<PromiseItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPromiseObservations({ includeDone: false })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const weekCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);

  const open = items ?? [];
  const overdue = open.filter((p) => p.dueDate && p.dueDate < today);
  const dueToday = open.filter((p) => p.dueDate === today);
  const dueThisWeek = open.filter(
    (p) => p.dueDate && p.dueDate >= today && p.dueDate <= weekCutoff
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "today":
        return dueToday;
      case "week":
        return dueThisWeek;
      case "overdue":
        return overdue;
      default:
        return open;
    }
  }, [filter, open, dueToday, dueThisWeek, overdue]);

  const toggle = async (p: PromiseItem) => {
    if (!items) return;
    // Optimistic: remove from open list when marking done.
    const before = items;
    setItems(items.filter((x) => x.observationId !== p.observationId));
    try {
      const newId = await togglePromiseDone(p.observationId, !p.done);
      const personLabel = p.participants.find(
        (x) => x.role === "primary"
      )?.fullName;
      toast(personLabel ? `Completado · ${personLabel}` : "Completado", {
        duration: UNDO_MS,
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await togglePromiseDone(newId, false);
              setItems((prev) => (prev ? [p, ...prev] : [p]));
            } catch (e) {
              console.error(e);
              toast.error("No se pudo deshacer.");
            }
          },
        },
      });
    } catch (e) {
      console.error(e);
      setItems(before);
      toast.error("No se pudo completar.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-3">
        <div className="flex w-full items-center justify-between">
          <CardTitle>Pendientes</CardTitle>
          <span className="text-[12px] text-muted-foreground">
            {filtered.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Chip
            label={`Todos · ${open.length}`}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <Chip
            label={`Hoy · ${dueToday.length}`}
            active={filter === "today"}
            onClick={() => setFilter("today")}
          />
          <Chip
            label={`Semana · ${dueThisWeek.length}`}
            active={filter === "week"}
            onClick={() => setFilter("week")}
          />
          {overdue.length > 0 && (
            <Chip
              label={`Vencidos · ${overdue.length}`}
              active={filter === "overdue"}
              onClick={() => setFilter("overdue")}
              destructive
            />
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="px-5 pb-5 text-[13px] text-muted-foreground">
            Cargando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 pb-5 text-[13px] text-muted-foreground">
            Nada por aquí.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.slice(0, 12).map((p) => (
              <PendienteRow
                key={p.observationId}
                item={p}
                today={today}
                onToggle={() => toggle(p)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PendienteRow({
  item,
  today,
  onToggle,
}: {
  item: PromiseItem;
  today: string;
  onToggle: () => void;
}) {
  const isOverdue = item.dueDate && item.dueDate < today;
  const primary =
    item.participants.find((x) => x.role === "primary") ??
    item.participants[0];
  const others = item.participants.filter(
    (x) => x.role !== "primary" && x.role !== "source"
  );
  return (
    <li className="flex items-center gap-3 px-5 py-2.5 hover:bg-secondary/40">
      <Checkbox checked={item.done} onCheckedChange={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {primary && (
            <Link
              href={`/contacts/${primary.personId}`}
              className="text-[13px] font-medium hover:underline"
            >
              {primary.fullName}
            </Link>
          )}
          {others.length > 0 && (
            <span className="text-[12px] text-muted-foreground">
              + {others.length}
            </span>
          )}
          <span className="text-[12px] text-muted-foreground">
            {item.direction === "yo-a-el" ? "yo →" : "← ellos"}
          </span>
        </div>
        <div className="truncate text-[13px] text-muted-foreground">
          {item.content}
        </div>
      </div>
      {item.dueDate && (
        <span
          className={`shrink-0 text-[12px] num ${
            isOverdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {formatDate(item.dueDate, { day: "2-digit", month: "short" })}
        </span>
      )}
    </li>
  );
}

function Chip({
  label,
  active,
  onClick,
  destructive,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  destructive?: boolean;
}) {
  const base = "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors";
  const cls = active
    ? destructive
      ? "border-destructive bg-destructive/10 text-destructive"
      : "border-accent bg-accent/10 text-accent"
    : "border-border bg-background text-muted-foreground hover:bg-secondary/60";
  return (
    <button onClick={onClick} className={`${base} ${cls}`}>
      {label}
    </button>
  );
}
