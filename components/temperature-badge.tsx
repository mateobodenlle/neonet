import type { Temperature } from "@/lib/types";
import { cn } from "@/lib/utils";

const config: Record<Temperature, { label: string; dot: string; text: string }> = {
  caliente: { label: "Caliente", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
  tibio: { label: "Tibio", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  frio: { label: "Frío", dot: "bg-slate-400", text: "text-slate-500 dark:text-slate-400" },
};

export function TemperatureBadge({ temperature, showLabel = true }: { temperature: Temperature; showLabel?: boolean }) {
  const c = config[temperature];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", c.text)}>
      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
      {showLabel && c.label}
    </span>
  );
}
