"use client";

import Link from "next/link";
import { useDerived } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { daysBetween, formatDate, relativeDate } from "@/lib/utils";
import { CalendarDays, Plus, Sun } from "lucide-react";
import { NLInputCard } from "@/components/nl-input-card";
import { PendientesCard } from "@/components/pendientes-card";

export function ClassicHome() {
  const d = useDerived();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const hot = d.db.people.filter((p) => p.temperature === "caliente" && !p.archived);

  const eventsToday = d.db.events.filter((e) => e.date === today || (e.endDate && e.date <= today && e.endDate >= today));
  const encountersToday = d.db.encounters.filter((e) => e.date === today);

  const recent = [...d.db.encounters].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const dormant = d.db.people
    .filter((p) => !p.archived)
    .map((p) => {
      const lastEncounter = d.getEncountersByPerson(p.id)[0]?.date;
      const lastObs = p.lastObservationAt?.slice(0, 10);
      const lastActivity = [lastEncounter, lastObs]
        .filter((x): x is string => !!x)
        .sort()
        .pop();
      return { person: p, days: lastActivity ? daysBetween(lastActivity) : 9999 };
    })
    .filter((x) => x.days > 90 && x.person.category !== "otro" && x.person.temperature !== "frio")
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const upcoming = [...d.db.events]
    .filter((e) => e.date >= today && e.date !== today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);

  const hasToday = eventsToday.length > 0 || encountersToday.length > 0;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {d.db.people.filter((p) => !p.archived).length} contactos
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/contacts"><Plus className="h-3.5 w-3.5" /> Nuevo contacto</Link>
        </Button>
      </header>

      <NLInputCard />

      {hasToday && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sun className="h-3.5 w-3.5 text-amber-500" /> Hoy</CardTitle>
            <span className="text-[12px] text-muted-foreground">{formatDate(today, { weekday: "long", day: "2-digit", month: "long" })}</span>
          </CardHeader>
          <CardContent className="space-y-3 p-5 pt-0">
            {eventsToday.length > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] text-muted-foreground">Evento{eventsToday.length > 1 ? "s" : ""}</div>
                <ul className="space-y-1.5">
                  {eventsToday.map((ev) => (
                    <li key={ev.id}>
                      <Link href={`/events/${ev.id}`} className="flex items-center gap-2.5 text-[13px] hover:underline">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{ev.name}</span>
                        {ev.location && <span className="text-muted-foreground">· {ev.location}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {encountersToday.length > 0 && (
              <div>
                <div className="mb-1.5 text-[12px] text-muted-foreground">Encuentros registrados hoy</div>
                <ul className="space-y-1">
                  {encountersToday.map((en) => {
                    const p = d.getPerson(en.personId);
                    if (!p) return null;
                    return (
                      <li key={en.id} className="flex items-center gap-2 text-[13px]">
                        <PersonAvatar person={p} className="h-5 w-5 text-[9px]" />
                        <Link href={`/contacts/${p.id}`} className="font-medium hover:underline">{p.fullName}</Link>
                        {en.location && <span className="text-muted-foreground">— {en.location}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <PendientesCard />

          <Card>
            <CardHeader><CardTitle>Actividad reciente</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recent.map((en) => {
                  const p = d.getPerson(en.personId);
                  const ev = en.eventId ? d.getEvent(en.eventId) : undefined;
                  if (!p) return null;
                  return (
                    <li key={en.id}>
                      <Link href={`/contacts/${p.id}`} className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-secondary/40">
                        <PersonAvatar person={p} className="h-7 w-7" />
                        <div className="text-[13px] font-medium">{p.fullName}</div>
                        <div className="min-w-0 truncate text-[13px] text-muted-foreground">{en.context ?? ev?.name ?? en.location ?? "—"}</div>
                        <span className="shrink-0 text-[12px] text-muted-foreground">{relativeDate(en.date)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>En caliente</CardTitle><span className="text-[12px] text-muted-foreground">{hot.length}</span></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {hot.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link href={`/contacts/${p.id}`} className="flex items-center gap-3 px-5 py-2 hover:bg-secondary/40">
                      <PersonAvatar person={p} className="h-7 w-7" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{p.fullName}</div>
                        <div className="truncate text-[12px] text-muted-foreground">{p.company ?? p.role ?? "—"}</div>
                      </div>
                      <TemperatureBadge temperature={p.temperature} showLabel={false} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Próximos eventos</CardTitle><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" /></CardHeader>
            <CardContent className="p-0">
              {upcoming.length === 0 ? (
                <div className="px-5 pb-5 text-[13px] text-muted-foreground">Nada agendado.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((ev) => {
                    const date = new Date(ev.date);
                    return (
                      <li key={ev.id}>
                        <Link href={`/events/${ev.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-secondary/40">
                          <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-secondary text-[10px]">
                            <span className="text-muted-foreground">{date.toLocaleString("es-ES", { month: "short" }).replace(".", "")}</span>
                            <span className="text-[13px] font-semibold leading-none">{date.getDate()}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium">{ev.name}</div>
                            <div className="truncate text-[12px] text-muted-foreground">{ev.location}</div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {dormant.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Reactivar</CardTitle><span className="text-[12px] text-muted-foreground">{dormant.length}</span></CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {dormant.map(({ person, days }) => (
                    <li key={person.id}>
                      <Link href={`/contacts/${person.id}`} className="flex items-center gap-3 px-5 py-2 hover:bg-secondary/40">
                        <PersonAvatar person={person} className="h-7 w-7" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{person.fullName}</div>
                          <div className="truncate text-[12px] text-muted-foreground">{person.company ?? person.role}</div>
                        </div>
                        <span className="text-[12px] text-muted-foreground">{Math.floor(days / 30)}m</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

