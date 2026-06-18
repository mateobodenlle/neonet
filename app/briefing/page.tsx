import Link from "next/link";
import { CalendarDays, AlertTriangle, ArrowUpRight, ArrowDownLeft, Target, ClipboardList } from "lucide-react";
import { getBriefingBoard } from "@/lib/briefing-actions";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeDate, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BriefingPage() {
  const { people, upcomingEvents } = await getBriefingBoard();
  const nothing = people.length === 0 && upcomingEvents.length === 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Briefing"
        subtitle="A quién preparar: compromisos abiertos y próximas reuniones."
      />

      {nothing ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="Nada que preparar ahora mismo"
              hint="Aquí aparecerán las personas con promesas abiertas o un siguiente paso, y los eventos próximos con su gente."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Personas con hilos abiertos
            </div>
            {people.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState inset title="Sin compromisos abiertos." />
                </CardContent>
              </Card>
            ) : (
              people.map((p) => (
                <Link key={p.personId} href={`/contacts/${p.personId}`} className="block">
                  <Card className="transition-colors hover:border-accent/40">
                    <CardContent className="space-y-2 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium">{p.personName}</div>
                          {p.company && (
                            <div className="truncate text-[12px] text-muted-foreground">{p.company}</div>
                          )}
                        </div>
                        <div className="shrink-0 text-[11px] text-muted-foreground">
                          {p.lastContact ? relativeDate(p.lastContact) : "—"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.overdue > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                            <AlertTriangle className="h-3 w-3" /> {p.overdue} vencida{p.overdue > 1 ? "s" : ""}
                          </span>
                        )}
                        {p.openByMe > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <ArrowUpRight className="h-3 w-3" /> {p.openByMe} le debes
                          </span>
                        )}
                        {p.openToMe > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                            <ArrowDownLeft className="h-3 w-3" /> {p.openToMe} te debe
                          </span>
                        )}
                      </div>
                      {p.topPromise && (
                        <div className="truncate text-[12px] text-muted-foreground">{p.topPromise}</div>
                      )}
                      {p.nextStep && (
                        <div className="flex items-start gap-1.5 text-[12px]">
                          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">{p.nextStep}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>

          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Próximas reuniones</div>
            {upcomingEvents.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState inset title="Nada agendado." />
                </CardContent>
              </Card>
            ) : (
              upcomingEvents.map((e) => (
                <Card key={e.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[13px]">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <Link href={`/events/${e.id}`} className="hover:underline">{e.name}</Link>
                    </CardTitle>
                    <span className="text-[12px] text-muted-foreground">
                      {formatDate(e.date)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    {e.people.length === 0 ? (
                      <div className="text-[12px] text-muted-foreground">Sin asistentes conocidos.</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {e.people.map((person) => (
                          <Link
                            key={person.id}
                            href={`/contacts/${person.id}`}
                            className="rounded-full border border-border bg-background px-2 py-0.5 text-[12px] hover:bg-secondary/60"
                          >
                            {person.fullName}
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
