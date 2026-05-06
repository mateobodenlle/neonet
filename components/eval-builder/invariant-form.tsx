"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { createEvalCaseAction } from "@/app/dev/eval-builder/_actions";
import type {
  NlExtractionRow,
  EvalInvariants,
  FacetExpectation,
} from "@/lib/eval-builder/types";

interface PersonOpt {
  id: string;
  full_name: string;
  company: string | null;
}

interface Props {
  extraction: NlExtractionRow;
  people: PersonOpt[];
  ownerPersonId: string | null;
}

function validateInvariants(inv: EvalInvariants): string | null {
  const r = (x: { min: number; max: number }) =>
    Number.isInteger(x.min) && Number.isInteger(x.max) && x.min >= 0 && x.max >= x.min;
  if (!r(inv.observations_count)) return "Rango observations_count inválido";
  if (!r(inv.warnings_count)) return "Rango warnings_count inválido";
  for (const f of inv.must_have_facets) {
    if (!f.type.trim()) return "Cada facet necesita type";
    if (!Number.isInteger(f.min_count) || f.min_count < 1) return "Cada facet necesita min_count ≥ 1";
  }
  return null;
}

function deriveDefaults(extraction: NlExtractionRow, ownerPersonId: string | null): EvalInvariants {
  const obsCount = extraction.raw_extraction.observations?.length ?? 0;
  const warnCount = extraction.raw_extraction.warnings?.length ?? 0;
  // Pre-fill mention persons from affected, excluding owner.
  const mention = extraction.affected_person_ids.filter((id) => id !== ownerPersonId);
  // Derive facets from raw observations.
  const facetCounts = new Map<string, number>();
  for (const o of extraction.raw_extraction.observations ?? []) {
    try {
      const f = JSON.parse(o.facets?.raw || "{}") as { type?: string };
      if (f.type) facetCounts.set(f.type, (facetCounts.get(f.type) ?? 0) + 1);
    } catch {}
  }
  const facets: FacetExpectation[] = [...facetCounts.entries()].map(([type, n]) => ({
    type,
    min_count: Math.max(1, Math.floor(n * 0.8)),
  }));
  return {
    observations_count: {
      min: Math.max(0, Math.floor(obsCount * 0.8)),
      max: Math.ceil(obsCount * 1.2),
    },
    must_mention_persons: mention,
    must_not_mention_persons: ownerPersonId ? [ownerPersonId] : [],
    must_mention_organizations: [],
    must_have_facets: facets,
    warnings_count: { min: Math.max(0, warnCount - 1), max: warnCount + 1 },
  };
}

export function PromoteForm({ extraction, people, ownerPersonId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inv, setInv] = useState<EvalInvariants>(() => deriveDefaults(extraction, ownerPersonId));
  const [tags, setTags] = useState<string>("");
  const [priority, setPriority] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  function togglePerson(list: keyof EvalInvariants, id: string) {
    setInv((v) => {
      const arr = (v[list] as string[]) ?? [];
      const next = arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
      return { ...v, [list]: next };
    });
  }

  function updateFacet(i: number, patch: Partial<FacetExpectation>) {
    setInv((v) => ({
      ...v,
      must_have_facets: v.must_have_facets.map((f, idx) => (idx === i ? { ...f, ...patch } : f)),
    }));
  }

  function addFacet() {
    setInv((v) => ({
      ...v,
      must_have_facets: [...v.must_have_facets, { type: "", min_count: 1 }],
    }));
  }

  function removeFacet(i: number) {
    setInv((v) => ({
      ...v,
      must_have_facets: v.must_have_facets.filter((_, idx) => idx !== i),
    }));
  }

  function onSave() {
    const err = validateInvariants(inv);
    if (err) {
      toast.error("Invariantes inválidos", { description: err });
      return;
    }
    start(async () => {
      try {
        const id = await createEvalCaseAction({
          extractionId: extraction.id,
          invariants: inv,
          notes: notes.trim() || null,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          priority,
        });
        toast.success("Caso guardado", { description: id });
        router.push("/dev/eval-builder/export");
      } catch (e) {
        toast.error("Error guardando", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded border bg-muted/20 p-3 text-sm">
        <div className="text-xs text-muted-foreground">Nota original</div>
        <div className="whitespace-pre-wrap">{extraction.note_text}</div>
      </div>

      <Section title="1. Conteo de observaciones">
        <RangeRow
          value={inv.observations_count}
          onChange={(v) => setInv((s) => ({ ...s, observations_count: v }))}
          hint={`real: ${extraction.raw_extraction.observations?.length ?? 0}`}
        />
      </Section>

      <PersonPicker
        title="2. Personas que DEBEN aparecer"
        people={people}
        selected={inv.must_mention_persons}
        onToggle={(id) => togglePerson("must_mention_persons", id)}
      />

      <PersonPicker
        title="3. Personas que NO DEBEN aparecer"
        people={people}
        selected={inv.must_not_mention_persons}
        onToggle={(id) => togglePerson("must_not_mention_persons", id)}
      />

      <Section title="4. Organizaciones que DEBEN aparecer">
        <Input
          placeholder="UUIDs separados por coma (TODO: selector)"
          value={inv.must_mention_organizations.join(", ")}
          onChange={(e) =>
            setInv((s) => ({
              ...s,
              must_mention_organizations: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            }))
          }
        />
      </Section>

      <Section title="5. Facets esperadas">
        <div className="space-y-2">
          {inv.must_have_facets.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded border p-2">
              <Input
                placeholder="type (p.ej. promesa)"
                value={f.type}
                onChange={(e) => updateFacet(i, { type: e.target.value })}
                className="w-48"
              />
              <Input
                placeholder='filters JSON ej {"direction":"yo-a-el"}'
                value={f.filters ? JSON.stringify(f.filters) : ""}
                onChange={(e) => {
                  try {
                    const v = e.target.value ? JSON.parse(e.target.value) : undefined;
                    updateFacet(i, { filters: v });
                  } catch {
                    // ignore until valid
                  }
                }}
                className="flex-1 min-w-64"
              />
              <Input
                type="number"
                min={1}
                value={f.min_count}
                onChange={(e) => updateFacet(i, { min_count: Number(e.target.value) || 1 })}
                className="w-20"
              />
              <Button variant="ghost" size="sm" onClick={() => removeFacet(i)}>
                ×
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addFacet}>
            + Añadir facet
          </Button>
        </div>
      </Section>

      <Section title="6. Conteo de warnings">
        <RangeRow
          value={inv.warnings_count}
          onChange={(v) => setInv((s) => ({ ...s, warnings_count: v }))}
          hint={`real: ${extraction.raw_extraction.warnings?.length ?? 0}`}
        />
      </Section>

      <Section title="7. Tags">
        <Input
          placeholder="ambiguedad, promesas, edge-case (separadas por coma)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </Section>

      <Section title="8. Prioridad">
        <Input
          type="number"
          min={0}
          max={5}
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) || 0)}
          className="w-24"
        />
      </Section>

      <Section title="9. Notas internas">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[80px]" />
      </Section>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={pending}>
          Guardar como caso de eval
        </Button>
      </div>
    </div>
  );

  function PersonPicker({
    title,
    people,
    selected,
    onToggle,
  }: {
    title: string;
    people: PersonOpt[];
    selected: string[];
    onToggle: (id: string) => void;
  }) {
    const [filter, setFilter] = useState("");
    const filtered = filter
      ? people.filter((p) => p.full_name.toLowerCase().includes(filter.toLowerCase()))
      : people.slice(0, 50);
    return (
      <Section title={title}>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => {
              const p = peopleById.get(id);
              return (
                <Badge key={id} variant="default" className="cursor-pointer" onClick={() => onToggle(id)}>
                  {p?.full_name ?? id} ×
                </Badge>
              );
            })}
            {selected.length === 0 && (
              <span className="text-xs text-muted-foreground">ninguna seleccionada</span>
            )}
          </div>
          <Input
            placeholder="Buscar persona…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8"
          />
          <div className="max-h-40 overflow-y-auto rounded border bg-muted/20">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onToggle(p.id)}
                className={`block w-full px-2 py-1 text-left text-xs hover:bg-muted ${
                  selected.includes(p.id) ? "bg-muted" : ""
                }`}
              >
                {p.full_name}
                {p.company && (
                  <span className="text-muted-foreground"> · {p.company}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Section>
    );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function RangeRow({
  value,
  onChange,
  hint,
}: {
  value: { min: number; max: number };
  onChange: (v: { min: number; max: number }) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span>min</span>
      <Input
        type="number"
        value={value.min}
        onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 0 })}
        className="w-20"
      />
      <span>max</span>
      <Input
        type="number"
        value={value.max}
        onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })}
        className="w-20"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
