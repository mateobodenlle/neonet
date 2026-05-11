import Link from "next/link";
import { CalendarDays, Inbox, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { getDashboardDemo } from "@/lib/demo/actions";
import { formatDate, relativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DemoHomePage() {
  const data = await getDashboardDemo();

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {data.totalPeople} contactos en tu red demo
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <Sparkles className="h-5 w-5 text-accent" />
          <div className="flex-1">
            <div className="text-[14px] font-medium">Nota rápida</div>
            <p className="text-[12px] text-muted-foreground">
              Pulsa <kbd className="rounded border border-border bg-secondary px-1 text-[10px]">⌘⇧J</kbd>{" "}
              (o el botón en la barra lateral) para abrir el extractor.
            </p>
          </div>
          {data.pendingNotes > 0 && (
            <Link
              href="/demo/m/pending"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] hover:bg-secondary/70"
            >
              <Inbox className="h-3.5 w-3.5" />
              {data.pendingNotes} pendiente{data.pendingNotes === 1 ? "" : "s"} de revisar
            </Link>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Actividad reciente</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {data.recentEncounters.map((en) => (
                  <li key={en.id}>
                    {en.person ? (
                      <Link
                        href={`/demo/contacts/${en.person.id}`}
                        className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 px-5 py-2.5 hover:bg-secondary/40"
                      >
                        <PersonAvatar person={en.person} className="h-7 w-7" />
                        <div className="text-[13px] font-medium">{en.person.fullName}</div>
                        <div className="min-w-0 truncate text-[13px] text-muted-foreground">
                          {en.context ?? en.event?.name ?? en.location ?? "—"}
                        </div>
                        <span className="shrink-0 text-[12px] text-muted-foreground">
                          {relativeDate(en.date)}
                        </span>
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                En caliente
              </CardTitle>
              <span className="text-[12px] text-muted-foreground">{data.hot.length}</span>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {data.hot.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/demo/contacts/${p.id}`}
                      className="flex items-center gap-3 px-5 py-2 hover:bg-secondary/40"
                    >
                      <PersonAvatar person={p} className="h-7 w-7" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{p.fullName}</div>
                        <div className="truncate text-[12px] text-muted-foreground">
                          {p.company ?? p.role ?? "—"}
                        </div>
                      </div>
                      <TemperatureBadge temperature={p.temperature} showLabel={false} />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                Próximos eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.upcomingEvents.length === 0 ? (
                <div className="px-5 pb-5 text-[13px] text-muted-foreground">Nada agendado.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.upcomingEvents.map((ev) => {
                    const date = new Date(ev.date);
                    return (
                      <li key={ev.id} className="flex items-center gap-3 px-5 py-2.5">
                        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-secondary text-[10px]">
                          <span className="text-muted-foreground">
                            {date
                              .toLocaleString("es-ES", { month: "short" })
                              .replace(".", "")}
                          </span>
                          <span className="text-[13px] font-semibold leading-none">
                            {date.getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{ev.name}</div>
                          <div className="truncate text-[12px] text-muted-foreground">
                            {ev.location ?? formatDate(ev.date)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
