"use client";

import Link from "next/link";
import { useParams, notFound } from "next/navigation";
import { useDerived } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { CategoryBadge } from "@/components/category-badge";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const d = useDerived();
  const ev = d.getEvent(params.id);
  if (!ev) notFound();

  const people = d.getPeopleByEvent(ev.id);
  const encountersHere = d.getEncountersByEvent(ev.id);

  return (
    <div className="space-y-6">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Eventos
      </Link>

      <header className="flex items-start gap-5">
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-secondary">
          <span className="text-[11px] text-muted-foreground">{new Date(ev.date).toLocaleString("es-ES", { month: "short" }).replace(".", "")}</span>
          <span className="text-lg font-semibold leading-none">{new Date(ev.date).getDate()}</span>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ev.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(ev.date, { day: "2-digit", month: "short", year: "numeric" })}
              {ev.endDate ? ` – ${formatDate(ev.endDate, { day: "2-digit", month: "short" })}` : ""}
            </span>
            {ev.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{ev.location}</span>}
          </div>
          {ev.notes && <p className="mt-3 max-w-xl text-[13px] text-muted-foreground">{ev.notes}</p>}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Personas ({people.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {encountersHere.map((en) => {
              const p = d.getPerson(en.personId);
              if (!p) return null;
              return (
                <li key={en.id}>
                  <Link href={`/contacts/${p.id}`} className="grid grid-cols-[auto_minmax(0,2fr)_110px_110px] items-center gap-4 px-5 py-2.5 hover:bg-secondary/40">
                    <PersonAvatar person={p} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{p.fullName}</div>
                      <div className="truncate text-[12px] text-muted-foreground">
                        {[p.role, p.company].filter(Boolean).join(" · ")}
                      </div>
                      {en.context && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{en.context}</div>}
                    </div>
                    <CategoryBadge category={p.category} />
                    <TemperatureBadge temperature={p.temperature} />
                  </Link>
                </li>
              );
            })}
            {people.length === 0 && <li className="p-8 text-center text-[13px] text-muted-foreground">Ningún contacto registrado.</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
