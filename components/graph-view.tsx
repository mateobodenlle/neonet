"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ReactFlow, Background, Controls, MiniMap, type Edge as RFEdge, type Node as RFNode } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Person, Edge } from "@/lib/types";

const tempDot = { caliente: "#ef4444", tibio: "#f59e0b", frio: "#94a3b8" } as const;

interface Props {
  people: Person[];
  edges: Edge[];
  coEventEdges: { key: string; weight: number }[];
}

export function GraphView({ people, edges, coEventEdges }: Props) {
  const { nodes, rfEdges } = useMemo(() => {
    const radius = Math.max(360, people.length * 15);
    const nodes: RFNode[] = people.map((p, i) => {
      const angle = (i / people.length) * Math.PI * 2;
      return {
        id: p.id,
        position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
        data: {
          label: (
            <Link href={`/contacts/${p.id}`} className="flex items-center gap-1.5 px-2 py-1 leading-tight">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tempDot[p.temperature] }} />
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium">{p.fullName}</div>
                {p.company && <div className="truncate text-[10px] text-muted-foreground">{p.company}</div>}
              </div>
            </Link>
          ),
        },
        style: {
          background: "hsl(var(--card))",
          color: "hsl(var(--foreground))",
          border: "1px solid hsl(var(--border))",
          borderRadius: 6,
          minWidth: 160,
          padding: 0,
        },
      };
    });

    const rfEdges: RFEdge[] = [];
    for (const e of edges) {
      rfEdges.push({
        id: e.id,
        source: e.fromPersonId,
        target: e.toPersonId,
        label: e.kind,
        style: { stroke: "hsl(var(--accent))", strokeWidth: 1, opacity: 0.6 },
        labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
        labelBgStyle: { fill: "hsl(var(--background))" },
      });
    }
    for (const { key, weight } of coEventEdges) {
      const [a, b] = key.split("|");
      rfEdges.push({
        id: `coev-${key}`,
        source: a,
        target: b,
        style: { stroke: "hsl(var(--muted-foreground) / 0.25)", strokeWidth: Math.min(2, weight * 0.7), strokeDasharray: "3 4" },
      });
    }
    return { nodes, rfEdges };
  }, [people, edges, coEventEdges]);

  return (
    <ReactFlow nodes={nodes} edges={rfEdges} fitView minZoom={0.2} maxZoom={1.5} proOptions={{ hideAttribution: true }}>
      <Background gap={20} color="hsl(var(--border))" />
      <Controls />
      <MiniMap
        pannable
        zoomable
        maskColor="hsl(var(--background) / 0.7)"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
        nodeColor={(n) => tempDot[(people.find((p) => p.id === n.id)?.temperature ?? "frio") as keyof typeof tempDot]}
      />
    </ReactFlow>
  );
}
