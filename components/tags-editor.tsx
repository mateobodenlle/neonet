"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function TagsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
    setAdding(false);
  };

  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((t) => (
        <Badge key={t} variant="subtle" className="group gap-1 pr-1">
          {t}
          <button
            onClick={() => remove(t)}
            className="rounded opacity-60 transition-opacity hover:opacity-100"
            aria-label={`Quitar ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") {
              setDraft("");
              setAdding(false);
            }
          }}
          className="h-6 rounded border border-input bg-background px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="nuevo tag"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-solid hover:bg-secondary/50 hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> tag
        </button>
      )}
    </div>
  );
}
