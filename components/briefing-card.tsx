"use client";

import { useEffect, useState } from "react";
import { ClipboardList, AlertTriangle, ArrowUpRight, ArrowDownLeft, Flame, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeDate, formatDate } from "@/lib/utils";
import { getBriefing, type Briefing, type BriefingPromise } from "@/lib/briefing-actions";

/**
 * The 3-second pre-meeting glance: last contact, open promises in both
 * directions, unresolved pain points and the queued next step. Renders
 * nothing (no loader flash) while loading or when there's nothing actionable,
 * so it only appears when it has something to say.
 */
export function BriefingCard({ personId, refreshKey }: { personId: string; refreshKey?: number }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBriefing(personId)
      .then((b) => {
        if (!cancelled) setBriefing(b);
      })
      .catch((e) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [personId, refreshKey]);

  if (!briefing || briefing.isEmpty) return null;

  const { lastContact, openPromisesByMe, openPromisesToMe, openPainPoints, activeThreads, nextStep } = briefing;

  return (
    <Card className="border-accent/30 bg-accent/[0.03]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-3.5 w-3.5 text-accent" />
          Briefing
        </CardTitle>
        <span className="text-[12px] text-muted-foreground">
          {lastContact ? `último contacto ${relativeDate(lastContact)}` : "sin contacto registrado"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-5 pt-0">
        {nextStep && (
          <Line icon={<Target className="h-3.5 w-3.5 text-accent" />} label="Siguiente paso">
            {nextStep}
          </Line>
        )}

        {openPromisesByMe.length > 0 && (
          <PromiseGroup
            icon={<ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />}
            label="Le prometiste"
            promises={openPromisesByMe}
          />
        )}

        {openPromisesToMe.length > 0 && (
          <PromiseGroup
            icon={<ArrowDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
            label="Te prometió"
            promises={openPromisesToMe}
          />
        )}

        {openPainPoints.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Flame className="h-3.5 w-3.5" /> Pain points abiertos
            </div>
            <ul className="space-y-0.5">
              {openPainPoints.map((p) => (
                <li key={p.observationId} className="text-[13px]">
                  {p.content}
                  <span className="ml-1.5 text-[11px] text-muted-foreground">· {formatDate(p.observedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeThreads.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Hilos activos</div>
            <ul className="space-y-0.5 text-[13px]">
              {activeThreads.map((th, i) => (
                <li key={i} className="flex items-center gap-2">
                  {th.status && <span className="text-[11px] text-muted-foreground">{th.status}</span>}
                  <span>{th.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Line({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

function PromiseGroup({
  icon,
  label,
  promises,
}: {
  icon: React.ReactNode;
  label: string;
  promises: BriefingPromise[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon} {label}
      </div>
      <ul className="space-y-0.5">
        {promises.map((p) => (
          <li key={p.observationId} className="flex items-start gap-1.5 text-[13px]">
            <span className="min-w-0 flex-1">{p.content}</span>
            {p.dueDate && (
              <span
                className={
                  p.overdue
                    ? "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-warning"
                    : "shrink-0 text-[11px] text-muted-foreground"
                }
              >
                {p.overdue && <AlertTriangle className="h-3 w-3" />}
                {formatDate(p.dueDate)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
