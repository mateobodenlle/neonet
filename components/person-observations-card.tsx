"use client";

import { useEffect, useState } from "react";
import { Loader2, ListTree, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  fetchPersonObservations,
  fetchPersonProfile,
} from "@/lib/observations-actions";
import type { Observation, PersonProfile } from "@/lib/types";

interface Props {
  personId: string;
  /** Bumped externally (e.g. after applyPlanV2 succeeds) to force a refetch. */
  refreshKey?: number;
  /** When provided, the card skips its own fetch and uses these. The parent
   *  is then responsible for keeping them fresh (typically by depending on
   *  the person's lastObservationAt timestamp). */
  observations?: Observation[] | null;
  profile?: PersonProfile | null;
  externalLoading?: boolean;
}

export function PersonObservationsCard({
  personId,
  refreshKey,
  observations: observationsProp,
  profile: profileProp,
  externalLoading,
}: Props) {
  const ownFetch = observationsProp === undefined;
  const [observationsState, setObservations] = useState<Observation[] | null>(null);
  const [profileState, setProfile] = useState<PersonProfile | null>(null);
  const [loadingState, setLoading] = useState(ownFetch);

  useEffect(() => {
    if (!ownFetch) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchPersonObservations(personId), fetchPersonProfile(personId)])
      .then(([obs, prof]) => {
        if (cancelled) return;
        setObservations(obs);
        setProfile(prof);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, refreshKey, ownFetch]);

  const observations = ownFetch ? observationsState : observationsProp ?? null;
  const profile = ownFetch ? profileState : profileProp ?? null;
  const loading = ownFetch ? loadingState : !!externalLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListTree className="h-3.5 w-3.5 text-accent" />
          Memoria sobre esta persona
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        )}

        {!loading && profile && profile.narrative && (
          <div className="rounded-md border border-border bg-secondary/30 px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              Perfil sintético
              {profile.lastSynthesizedAt && (
                <span className="ml-auto text-[10px] normal-case opacity-70">
                  generado {formatDate(profile.lastSynthesizedAt)}
                </span>
              )}
            </div>
            <div className="text-[13px] leading-relaxed">{profile.narrative}</div>
            {profile.recurringThemes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {profile.recurringThemes.map((t, i) => (
                  <Badge key={i} variant="default" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
            {profile.activeThreads.length > 0 && (
              <div className="mt-2 space-y-0.5 text-[12px]">
                {profile.activeThreads.map((t, i) => {
                  const th = t as { title?: string; status?: string };
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground">{th.status ?? "—"}</span>
                      <span>{th.title ?? ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loading && !profile?.narrative && (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
            Aún no hay perfil sintético. Se generará tras la próxima ejecución del job de síntesis.
          </div>
        )}

        {!loading && observations && observations.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              Observaciones recientes
            </div>
            <div className="space-y-1.5">
              {observations.map((o) => {
                const facets = o.facets as Record<string, unknown>;
                const facetType = typeof facets.type === "string" ? facets.type : null;
                return (
                  <div
                    key={o.id}
                    className="rounded-md border border-border bg-card px-3 py-2 text-[13px]"
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span>{formatDate(o.observedAt)}</span>
                      {facetType && (
                        <Badge variant="default" className="text-[10px]">
                          {facetType}
                        </Badge>
                      )}
                      <span className="ml-auto opacity-60 text-[10px]">{o.source}</span>
                    </div>
                    <div className="mt-0.5">{o.content}</div>
                    {o.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {o.tags.map((t, i) => (
                          <Badge key={i} variant="default" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && observations && observations.length === 0 && (
          <div className="text-[12px] text-muted-foreground">
            Sin observaciones todavía. Usa la caja de texto libre o el input global (⌘⇧J).
          </div>
        )}
      </CardContent>
    </Card>
  );
}
