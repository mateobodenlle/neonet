"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInput } from "@/components/shared/voice-input";
import { processNoteAsync } from "@/lib/mobile-actions";

const BACKUP_KEY = "neonet-pending-note-backup";

interface Props {
  /** Acción para procesar la nota. Por defecto: server action real. */
  processNote?: (text: string) => Promise<{ extractionId: string }>;
  /** Ruta de pendientes (mobile real vs demo). */
  pendingHref?: string;
  /** Banner opcional encima del input. */
  banner?: React.ReactNode;
  /** Endpoint de transcripción para VoiceInput. */
  transcribeUrl?: string;
}

export function MobileCapture({
  processNote = processNoteAsync,
  pendingHref = "/m/pending",
  banner,
  transcribeUrl,
}: Props = {}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hydrated = useRef(false);

  // Restaura un draft pendiente al montar (por si la última vez se cerró
  // la pestaña antes de procesar).
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    try {
      const saved = localStorage.getItem(BACKUP_KEY);
      if (saved) setText(saved);
    } catch {
      /* noop */
    }
  }, []);

  // Mantiene el backup actualizado mientras el usuario escribe.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      if (text.trim()) localStorage.setItem(BACKUP_KEY, text);
      else localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* noop */
    }
  }, [text]);

  async function onProcess() {
    const snapshot = text.trim();
    if (!snapshot || submitting) return;
    setSubmitting(true);
    setText("");
    try {
      localStorage.setItem(BACKUP_KEY, snapshot);
    } catch {
      /* noop */
    }
    const toastId = toast.loading("Procesando nota…");
    try {
      await processNote(snapshot);
      try {
        localStorage.removeItem(BACKUP_KEY);
      } catch {
        /* noop */
      }
      toast.success("Nota lista para revisar", {
        id: toastId,
        action: {
          label: "Ver",
          onClick: () => router.push(pendingHref),
        },
      });
      // Recarga el server layout → contador del header al día.
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Error al procesar", {
        id: toastId,
        description: message,
        duration: 12000,
        action: {
          label: "Recuperar texto",
          onClick: () => setText(snapshot),
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  function onTranscript(t: string) {
    setText((prev) => (prev.trim() ? `${prev}\n${t}` : t));
  }

  return (
    <div className="space-y-4">
      {banner}
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">Captura</h1>
        <p className="text-xs text-muted-foreground">
          Texto libre. La extracción se ejecuta en background — puedes seguir capturando.
        </p>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="¿Qué pasó? Escribe o usa el micrófono."
        className="min-h-[180px] text-[16px] leading-relaxed"
        rows={8}
      />

      <div className="flex items-center justify-between gap-2">
        <VoiceInput onTranscript={onTranscript} transcribeUrl={transcribeUrl} />
      </div>

      <Button
        onClick={onProcess}
        disabled={submitting || !text.trim()}
        className="h-14 w-full text-base"
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Procesar
      </Button>

      <div className="pt-2 text-center">
        <Link
          href={pendingHref}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Ver pendientes →
        </Link>
      </div>
    </div>
  );
}
