import { cn } from "@/lib/utils";

/**
 * One zero-state treatment for the whole app: an optional icon, a calm title
 * and an optional hint/action, centered with consistent padding. Replaces the
 * dozen bespoke "Sin resultados." / "Nada por aquí." divs that each had their
 * own padding and tone.
 *
 * `inset` uses tighter padding for empty states that sit inside a card body
 * (where the card already provides the frame).
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  inset = false,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  inset?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 text-center",
        inset ? "px-5 py-8" : "px-6 py-12",
        className,
      )}
    >
      {icon != null && <div className="text-muted-foreground">{icon}</div>}
      <div className="text-[13px] font-medium text-foreground/80">{title}</div>
      {hint != null && <p className="max-w-sm text-[12px] text-muted-foreground">{hint}</p>}
      {action != null && <div className="mt-1">{action}</div>}
    </div>
  );
}
