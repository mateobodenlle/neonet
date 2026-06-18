import type { Temperature } from "@/lib/types";
import { cn } from "@/lib/utils";

// Dot color carries the temperature; the label stays neutral so the badge
// reads as informative rather than shouty. Colors come from the --temp-*
// tokens (see app/globals.css) so badge, picker and graph share one source.
const config: Record<Temperature, { label: string; dot: string }> = {
  caliente: { label: "Caliente", dot: "bg-temp-hot" },
  tibio: { label: "Tibio", dot: "bg-temp-warm" },
  frio: { label: "Frío", dot: "bg-temp-cold" },
};

export function TemperatureBadge({ temperature, showLabel = true }: { temperature: Temperature; showLabel?: boolean }) {
  const c = config[temperature];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", showLabel && "text-foreground/80")}>
      <span className={cn("h-2 w-2 rounded-full", c.dot)} />
      {showLabel && c.label}
    </span>
  );
}
