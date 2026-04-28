"use client";

import type { Category } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";

const options: { value: Category; label: string }[] = [
  { value: "cliente-potencial", label: "Prospect" },
  { value: "cliente", label: "Cliente" },
  { value: "inversor", label: "Inversor" },
  { value: "partner", label: "Partner" },
  { value: "talento", label: "Talento" },
  { value: "amigo", label: "Amigo" },
  { value: "otro", label: "Otro" },
];

export function CategoryPicker({
  value,
  onChange,
}: {
  value: Category;
  onChange: (v: Category) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="-mx-1 -my-0.5 rounded px-1 py-0.5 transition-colors hover:bg-secondary">
          <CategoryBadge category={value} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40" align="start">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-secondary"
          >
            <span className="flex-1">{o.label}</span>
            {value === o.value && <Check className="h-3.5 w-3.5 text-accent" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
