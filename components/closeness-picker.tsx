"use client";

import { CLOSENESS_LEVELS, type Closeness } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, UserCircle, X } from "lucide-react";
import { ClosenessBadge } from "./closeness-badge";

const labels: Record<Closeness, string> = {
  "desconocido":     "Desconocido",
  "conocido":        "Conocido",
  "amigable":        "Amigable",
  "amigo":           "Amigo",
  "amigo-cercano":   "Amigo cercano",
  "mejor-amigo":     "Mejor amigo",
};

export function ClosenessPicker({
  value,
  onChange,
}: {
  value: Closeness | undefined;
  onChange: (v: Closeness | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="-mx-1 -my-0.5 rounded px-1 py-0.5 transition-colors hover:bg-secondary">
          {value ? (
            <ClosenessBadge closeness={value} />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <UserCircle className="h-3 w-3 opacity-60" />
              Sin cercanía
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44" align="start">
        {CLOSENESS_LEVELS.map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
          >
            <span className="flex-1">{labels[level]}</span>
            {value === level && <Check className="h-3.5 w-3.5 text-accent" />}
          </button>
        ))}
        {value && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => onChange(undefined)}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-secondary"
            >
              <X className="h-3 w-3" />
              Quitar
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
