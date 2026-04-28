"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={15000}
      gap={8}
      offset={20}
      toastOptions={{
        className:
          "!bg-card !text-foreground !border !border-border !rounded-lg !shadow-lg !text-[13px]",
        descriptionClassName: "!text-muted-foreground",
        actionButtonStyle: {
          background: "hsl(var(--accent))",
          color: "hsl(var(--accent-foreground))",
          borderRadius: "calc(var(--radius) - 2px)",
          padding: "4px 10px",
          fontSize: "12px",
          fontWeight: 500,
        },
      }}
    />
  );
}
