import { cn, initials } from "@/lib/utils";
import type { Person } from "@/lib/types";

export function PersonAvatar({ person, className }: { person: Person; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-foreground/70",
        className
      )}
    >
      {person.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.photoUrl} alt={person.fullName} className="absolute inset-0 h-full w-full rounded-full object-cover" />
      ) : (
        <span>{initials(person.fullName)}</span>
      )}
    </div>
  );
}
