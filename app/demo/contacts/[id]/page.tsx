import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Mail, Linkedin, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { ClosenessBadge } from "@/components/closeness-badge";
import { getPersonByIdDemo } from "@/lib/demo/actions";
import { formatDate, relativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DemoContactDetail({ params }: PageProps) {
  const { id } = await params;
  const detail = await getPersonByIdDemo(id);
  if (!detail) notFound();
  const { person, observations, encounters, events, edges, narrative } = detail;

  return (
    <div className="space-y-6">
      <Link
        href="/demo/contacts"
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a contactos
      </Link>

      <header className="flex items-start gap-4">
        <PersonAvatar person={person} className="h-14 w-14 text-[14px]" />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{person.fullName}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {[person.role, person.company].filter(Boolean).join(" · ") || "—"}
            {person.location ? ` · ${person.location}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TemperatureBadge temperature={person.temperature} />
            {person.closeness && <ClosenessBadge closeness={person.closeness} />}
            {(person.tags ?? []).map((t) => (
              <Badge key={t} variant="default" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      </header>

      {(person.handles?.email || person.handles?.linkedin) && (
        <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
          {person.handles?.email && (
            <a
              href={`mailto:${person.handles.email}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-3.5 w-3.5" />
              {person.handles.email}
            </a>
          )}
          {person.handles?.linkedin && (
            <span className="inline-flex items-center gap-1.5">
              <Linkedin className="h-3.5 w-3.5" />
              {person.handles.linkedin}
            </span>
          )}
        </div>
      )}

      {narrative && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Síntesis
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 text-[13px] leading-relaxed text-foreground/90">
            {narrative}
          </CardContent>
        </Card>
      )}

      {person.nextStep && (
        <Card>
          <CardHeader>
            <CardTitle>Próximo paso</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 text-[13px]">{person.nextStep}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
            <span className="text-[12px] text-muted-foreground">{observations.length}</span>
          </CardHeader>
          <CardContent className="p-0">
            {observations.length === 0 ? (
              <div className="px-5 pb-5 text-[13px] text-muted-foreground">Sin observaciones.</div>
            ) : (
              <ul className="divide-y divide-border">
                {observations.map((o) => {
                  const facetType =
                    o.facets && typeof o.facets === "object" && "type" in o.facets
                      ? String((o.facets as Record<string, unknown>).type)
                      : null;
                  return (
                    <li key={o.id} className="px-5 py-3">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(o.observedAt)}
                        {facetType && (
                          <Badge variant="default" className="ml-1 text-[10px]">
                            {facetType}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-relaxed">{o.content}</p>
                      {o.tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {o.tags.map((t) => (
                            <Badge key={t} variant="default" className="text-[10px]">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {encounters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Encuentros</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {encounters.map((en) => {
                    const ev = events.find((e) => e.id === en.eventId);
                    return (
                      <li key={en.id} className="px-5 py-2.5 text-[12px]">
                        <div className="text-muted-foreground">{relativeDate(en.date)}</div>
                        <div className="text-[13px]">
                          {ev?.name ?? en.context ?? en.location ?? "—"}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {edges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Conexiones</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {edges.map((e) => (
                    <li key={e.id} className="px-5 py-2 text-[12px]">
                      {e.otherPerson ? (
                        <Link
                          href={`/demo/contacts/${e.otherPerson.id}`}
                          className="text-[13px] font-medium hover:underline"
                        >
                          {e.otherPerson.fullName}
                        </Link>
                      ) : (
                        <span className="text-[13px]">—</span>
                      )}
                      <div className="text-muted-foreground">
                        {e.kind}
                        {e.note ? ` · ${e.note}` : ""}
                      </div>
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
