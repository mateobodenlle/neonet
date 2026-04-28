"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function EventsPage() {
  const events = useStore((s) => s.events);
  const encounters = useStore((s) => s.encounters);

  const counts = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const en of encounters) {
      if (!en.eventId) continue;
      if (!map.has(en.eventId)) map.set(en.eventId, new Set());
      map.get(en.eventId)!.add(en.personId);
    }
    return map;
  }, [encounters]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {events.length} registrados · {encounters.filter((e) => e.eventId).length} encuentros ubicados
        </p>
      </header>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[13px] font-semibold text-muted-foreground">Próximos</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {upcoming.map((ev) => <EventRow key={ev.id} event={ev} people={counts.get(ev.id)?.size ?? 0} upcoming />)}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[13px] font-semibold text-muted-foreground">Pasados</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {past.map((ev) => <EventRow key={ev.id} event={ev} people={counts.get(ev.id)?.size ?? 0} />)}
        </div>
      </section>
    </div>
  );
}

function EventRow({
  event,
  people,
  upcoming,
}: {
  event: { id: string; name: string; date: string; endDate?: string; location?: string; notes?: string };
  people: number;
  upcoming?: boolean;
}) {
  const d = new Date(event.date);
  return (
    <Link href={`/events/${event.id}`} className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/40">
      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-secondary">
        <span className="text-[10px] text-muted-foreground">{d.toLocaleString("es-ES", { month: "short" }).replace(".", "")}</span>
        <span className="text-[15px] font-semibold leading-none">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[14px] font-medium">{event.name}</h3>
          {upcoming && <Badge variant="accent">próximo</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {formatDate(event.date, { day: "2-digit", month: "short" })}
            {event.endDate ? ` – ${formatDate(event.endDate, { day: "2-digit", month: "short" })}` : ""}
          </span>
          {event.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>}
        </div>
      </div>
      <div className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
        <Users className="h-3 w-3" />
        {people}
      </div>
    </Link>
  );
}
