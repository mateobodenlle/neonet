"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { processNoteDemo } from "@/lib/demo/actions";

export function DemoNLDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function onSubmit() {
    const snapshot = text.trim();
    if (!snapshot || submitting) return;
    setSubmitting(true);
    const toastId = toast.loading("Procesando nota…");
    try {
      const { extractionId } = await processNoteDemo(snapshot);
      toast.success("Nota lista para revisar", {
        id: toastId,
        action: {
          label: "Revisar",
          onClick: () => router.push(`/demo/m/pending/${extractionId}`),
        },
      });
      setText("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error("Error al procesar", {
        id: toastId,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Nota rápida (demo)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hoy quedé con Marta, me dijo X, me prometió Y…"
            className="min-h-[180px] text-[14px]"
            autoFocus
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>La extracción se ejecuta contra OpenAI. Los cambios no se guardan.</span>
            <Button onClick={onSubmit} disabled={submitting || !text.trim()}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Procesar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
