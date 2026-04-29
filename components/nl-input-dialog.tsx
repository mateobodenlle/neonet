"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NLInput } from "./nl-input";

/**
 * Global Ctrl/Cmd+Shift+J dialog. Mounted once at the layout level. Cmd+J
 * alone is taken by Chrome (Downloads), so we use the Shift variant.
 */
export function NLInputDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Nota rápida
          </DialogTitle>
        </DialogHeader>
        <NLInput onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
