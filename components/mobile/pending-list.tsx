"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface PendingItem {
  id: string;
  created_at: string;
  note_text: string;
  observations_count: number;
  mention_texts: string[];
}

interface Props {
  items: PendingItem[];
}

function snippet(text: string, max = 90): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return iso;
  }
}

export function PendingList({ items }: Props) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Pendientes ({items.length})
        </h1>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.refresh()}
          aria-label="Refrescar"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <Inbox className="h-6 w-6 opacity-50" />
          <div>No hay nada pendiente.</div>
          <Link
            href="/m"
            className="text-accent underline-offset-4 hover:underline"
          >
            Volver a capturar
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/m/pending/${item.id}`}
                className="block rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {relative(item.created_at)}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-1 text-[14px] leading-snug">
                  {snippet(item.note_text)}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{item.observations_count} obs</span>
                  <span>·</span>
                  <span>{item.mention_texts.length} menciones</span>
                  {item.mention_texts.slice(0, 3).map((t) => (
                    <Badge key={t} variant="default" className="ml-1 text-[10px]">
                      {t}
                    </Badge>
                  ))}
                  {item.mention_texts.length > 3 && (
                    <span className="text-muted-foreground">
                      +{item.mention_texts.length - 3}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
