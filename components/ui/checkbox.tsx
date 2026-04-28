"use client";
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  id?: string;
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ checked, onCheckedChange, className, id }, ref) => (
    <button
      ref={ref}
      id={id}
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCheckedChange?.(!checked);
      }}
      className={cn(
        "peer flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border border-border bg-background/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 hover:border-accent/60",
        checked && "border-accent bg-accent text-accent-foreground",
        className
      )}
      type="button"
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
);
Checkbox.displayName = "Checkbox";
