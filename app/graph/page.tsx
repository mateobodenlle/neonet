"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import dynamic from "next/dynamic";

const GraphView = dynamic(() => import("@/components/graph-view").then((m) => m.GraphView), { ssr: false });

export default function GraphPage() {
  const people = useStore((s) => s.people);
  const edges = useStore((s) => s.edges);
  const encounters = useStore((s) => s.encounters);

  const data = useMemo(() => {
    const map = new Map<string, number>();
    const byEvent = new Map<string, Set<string>>();
    for (const en of encounters) {
      if (!en.eventId) continue;
      if (!byEvent.has(en.eventId)) byEvent.set(en.eventId, new Set());
      byEvent.get(en.eventId)!.add(en.personId);
    }
    for (const set of byEvent.values()) {
      const arr = [...set];
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = arr[i] < arr[j] ? `${arr[i]}|${arr[j]}` : `${arr[j]}|${arr[i]}`;
          map.set(k, (map.get(k) ?? 0) + 1);
        }
      }
    }
    return { people, edges, coEventEdges: [...map.entries()].map(([k, v]) => ({ key: k, weight: v })) };
  }, [people, edges, encounters]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Grafo</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {data.people.length} nodos · {data.edges.length} aristas explícitas · {data.coEventEdges.length} co-eventos
        </p>
      </header>
      <div className="h-[calc(100vh-180px)] overflow-hidden rounded-lg border border-border bg-card">
        <GraphView people={data.people} edges={data.edges} coEventEdges={data.coEventEdges} />
      </div>
    </div>
  );
}
