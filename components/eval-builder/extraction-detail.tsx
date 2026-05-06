"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  NlExtractionRow,
  NlExtractionCorrectionRow,
} from "@/lib/eval-builder/types";

interface Props {
  extraction: NlExtractionRow;
  corrections: NlExtractionCorrectionRow[];
}

export function ExtractionDetail({ extraction, corrections }: Props) {
  const [tab, setTab] = useState("summary");
  const raw = extraction.raw_extraction;
  const applied = extraction.applied_plan;

  return (
    <div className="space-y-4">
      <div className="rounded border p-4">
        <div className="text-xs text-muted-foreground mb-2">
          {new Date(extraction.created_at).toLocaleString()} · {extraction.model} ·{" "}
          {extraction.extraction_type}
          {extraction.applied_at ? (
            <Badge className="ml-2" variant="default">aplicada</Badge>
          ) : (
            <Badge className="ml-2" variant="subtle">descartada</Badge>
          )}
        </div>
        <p className="whitespace-pre-wrap text-sm">{extraction.note_text}</p>
        {extraction.note_context && (
          <p className="mt-2 text-xs text-muted-foreground">
            Contexto: {extraction.note_context}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button asChild size="sm">
            <Link href={`/dev/eval-builder/${extraction.id}/promote`}>
              Promover a caso de eval →
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="raw">Plan crudo</TabsTrigger>
          <TabsTrigger value="applied">Plan aplicado</TabsTrigger>
          <TabsTrigger value="corrections">
            Correcciones ({corrections.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="rounded border p-4 text-sm space-y-2">
            <div>
              <strong>Tokens:</strong> prompt={extraction.prompt_tokens ?? "-"} ·
              cached={extraction.cached_tokens ?? "-"} · completion=
              {extraction.completion_tokens ?? "-"}
            </div>
            <div>
              <strong>Duración:</strong> {extraction.duration_ms ?? "-"} ms ·{" "}
              <strong>Directory:</strong> {extraction.directory_size ?? "-"} contactos
            </div>
            <div>
              <strong>Observaciones:</strong> {raw.observations?.length ?? 0} ·{" "}
              <strong>Personas afectadas:</strong> {extraction.affected_person_ids.length} ·{" "}
              <strong>Warnings:</strong> {raw.warnings?.length ?? 0}
            </div>
            {raw.warnings && raw.warnings.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {raw.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            <div className="text-xs text-muted-foreground">
              Resumen LLM: {raw.summary || <em>(vacío)</em>}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="raw">
          <PlanView plan={raw} />
        </TabsContent>

        <TabsContent value="applied">
          {applied ? (
            <PlanView plan={{
              observations: applied.observations,
              events: applied.events,
              person_updates: applied.person_updates,
              warnings: [],
              summary: "(plan aplicado)",
            }} extraInfo={
              <div className="text-xs text-muted-foreground">
                Resoluciones:
                <ul className="list-disc pl-5 mt-1">
                  {Object.entries(applied.resolutions).map(([text, res]) => (
                    <li key={text}>
                      <code>{text}</code> → {res.kind}
                      {res.kind === "existing" && ` ${res.personId}`}
                      {res.kind === "new" && ` ${res.person.full_name}`}
                    </li>
                  ))}
                </ul>
              </div>
            } />
          ) : (
            <div className="rounded border p-4 text-sm text-muted-foreground">
              No aplicada (descartada en preview).
            </div>
          )}
        </TabsContent>

        <TabsContent value="corrections">
          <div className="rounded border p-4 text-sm space-y-3">
            {corrections.length === 0 && (
              <p className="text-muted-foreground">Sin correcciones registradas.</p>
            )}
            {corrections.map((c) => (
              <div key={c.id} className="border-b pb-2 last:border-b-0">
                <div className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()} ·{" "}
                  <Badge variant="outline">{c.correction_type}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">antes</div>
                    <pre className="bg-muted/40 rounded p-2 text-xs overflow-x-auto">
                      {JSON.stringify(c.before, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground">después</div>
                    <pre className="bg-muted/40 rounded p-2 text-xs overflow-x-auto">
                      {JSON.stringify(c.after, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlanView({
  plan,
  extraInfo,
}: {
  plan: NlExtractionRow["raw_extraction"];
  extraInfo?: React.ReactNode;
}) {
  return (
    <div className="rounded border p-4 text-sm space-y-3">
      {extraInfo}
      <div>
        <div className="font-medium">Observaciones ({plan.observations?.length ?? 0})</div>
        <ul className="space-y-2 mt-2">
          {(plan.observations ?? []).map((o, i) => (
            <li key={i} className="rounded border p-2 bg-muted/20">
              <div className="text-xs text-muted-foreground">
                primary: <code>{o.primary_mention.text}</code> · observed_at: {o.observed_at}
              </div>
              <div className="mt-1">{o.content}</div>
              <div className="text-xs text-muted-foreground mt-1">
                facets: <code>{o.facets?.raw}</code>
              </div>
              {o.participants?.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  participants: {o.participants.map((p) => `${p.mention.text}(${p.role})`).join(", ")}
                </div>
              )}
              {o.tags?.length > 0 && (
                <div className="text-xs">tags: {o.tags.join(", ")}</div>
              )}
              {o.supersedes_hint && (
                <div className="text-xs text-amber-700 mt-1">
                  supersedes hint: {o.supersedes_hint.reason} (
                  {o.supersedes_hint.candidate_observation_ids.join(", ")})
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      {plan.events && plan.events.length > 0 && (
        <div>
          <div className="font-medium">Eventos ({plan.events.length})</div>
          <ul className="text-xs">
            {plan.events.map((e, i) => (
              <li key={i}>
                {e.name} · {e.date} · {e.location ?? "-"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.person_updates && plan.person_updates.length > 0 && (
        <div>
          <div className="font-medium">Person updates ({plan.person_updates.length})</div>
          <ul className="text-xs">
            {plan.person_updates.map((u, i) => (
              <li key={i}>
                <code>{u.primary_mention.text}</code> · {u.field} = {u.new_value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
