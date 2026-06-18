import { GraphView } from "@/components/graph-view";
import { getGraphDataDemo } from "@/lib/demo/actions";

export const dynamic = "force-dynamic";

export default async function DemoGraphPage() {
  const { people, edges, coEventEdges } = await getGraphDataDemo();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Grafo</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {people.length} nodos · {edges.length} aristas explícitas · {coEventEdges.length} co-eventos
        </p>
      </header>
      <div className="h-[calc(100vh-220px)] min-h-[480px] rounded-lg border border-border bg-card">
        <GraphView
          people={people}
          edges={edges}
          coEventEdges={coEventEdges}
          contactLinkPrefix="/demo/contacts"
        />
      </div>
    </div>
  );
}
