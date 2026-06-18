import { cn } from "@/lib/utils";

/**
 * The page title / subtitle / right-aligned action row repeated across every
 * top-level page. One component so the heading scale and spacing stay
 * identical everywhere instead of drifting per copy-paste.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle != null && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      {action != null && <div className="shrink-0">{action}</div>}
    </header>
  );
}
