import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/person-avatar";
import { TemperatureBadge } from "@/components/temperature-badge";
import { getAllPeopleDemo } from "@/lib/demo/actions";

export const dynamic = "force-dynamic";

export default async function DemoContactsPage() {
  const people = await getAllPeopleDemo();

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{people.length} personas</p>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/demo/contacts/${p.id}`}
                  className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 hover:bg-secondary/40"
                >
                  <PersonAvatar person={p} className="h-9 w-9" />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium">{p.fullName}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {[p.role, p.company].filter(Boolean).join(" · ") || "—"}
                      {p.location ? ` · ${p.location}` : ""}
                    </div>
                  </div>
                  <div className="hidden gap-1 sm:flex">
                    {(p.tags ?? []).slice(0, 3).map((t) => (
                      <Badge key={t} variant="default" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <TemperatureBadge temperature={p.temperature} showLabel={false} />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
