"use client";

import type { Temperature } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TemperatureBadge } from "@/components/temperature-badge";

const options: { value: Temperature; label: string; dot: string }[] = [
  { value: "caliente", label: "Caliente", dot: "bg-red-500" },
  { value: "tibio", label: "Tibio", dot: "bg-amber-500" },
  { value: "frio", label: "Frío", dot: "bg-slate-400" },
];

export function TemperaturePicker({
  value,
  onChange,
}: {
  value: Temperature;
  onChange: (v: Temperature) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="-mx-1 -my-0.5 rounded px-1 py-0.5 transition-colors hover:bg-secondary">
          <TemperatureBadge temperature={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40" align="start">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
          >
            <span className={cn("h-2 w-2 rounded-full", o.dot)} />
            <span className="flex-1">{o.label}</span>
            {value === o.value && <Check className="h-3.5 w-3.5 text-accent" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
