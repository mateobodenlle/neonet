import type { Closeness } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UserCircle } from "lucide-react";

const config: Record<Closeness, { label: string; text: string }> = {
  "desconocido":     { label: "Desconocido",     text: "text-muted-foreground" },
  "conocido":        { label: "Conocido",        text: "text-muted-foreground" },
  "amigable":        { label: "Amigable",        text: "text-foreground" },
  "amigo":           { label: "Amigo",           text: "text-foreground" },
  "amigo-cercano":   { label: "Amigo cercano",   text: "text-foreground" },
  "mejor-amigo":     { label: "Mejor amigo",     text: "text-foreground" },
};

export function ClosenessBadge({ closeness, showIcon = true }: { closeness: Closeness; showIcon?: boolean }) {
  const c = config[closeness];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", c.text)}>
      {showIcon && <UserCircle className="h-3 w-3 opacity-60" />}
      {c.label}
    </span>
  );
}
