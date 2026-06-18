"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Tipos mínimos para la Web Speech API (no en lib.dom estable).
type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

const HARD_STOP_SECONDS = 30;
const UPLOAD_TIMEOUT_MS = 55_000;
const IDB_NAME = "neonet-voice";
const IDB_STORE = "pending";
const IDB_KEY = "latest";

interface PendingBlob {
  blob: Blob;
  mime: string;
  language: string;
  createdAt: number;
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(value: PendingBlob): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

async function idbGet(): Promise<PendingBlob | null> {
  const db = await openIdb();
  if (!db) return null;
  const result = await new Promise<PendingBlob | null>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as PendingBlob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
  db.close();
  return result;
}

async function idbDel(): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  db.close();
}

export interface VoiceInputProps {
  onTranscript: (text: string) => void;
  language?: string;
  disabled?: boolean;
  className?: string;
  /** Endpoint de transcripción. Default: /api/transcribe (CRM real). */
  transcribeUrl?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "permission" }
  | { kind: "recording"; startedAt: number; elapsed: number }
  | { kind: "uploading" }
  | { kind: "fallback-listening" }
  | { kind: "recoverable"; sizeKb: number }
  | { kind: "error"; message: string; offerFallback: boolean };

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString();
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function VoiceInput({
  onTranscript,
  language = "es",
  disabled,
  className,
  transcribeUrl = "/api/transcribe",
}: VoiceInputProps) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string | undefined>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRecRef = useRef<SpeechRecognitionLike | null>(null);

  function clearTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }

  // Limpieza al desmontar.
  useEffect(() => {
    return () => {
      clearTick();
      releaseStream();
      try {
        fallbackRecRef.current?.abort();
      } catch {
        /* noop */
      }
    };
  }, []);

  // Si hay un audio pendiente de una sesión anterior, ofrece recuperarlo.
  useEffect(() => {
    let cancelled = false;
    void idbGet().then((pending) => {
      if (cancelled || !pending) return;
      setState({ kind: "recoverable", sizeKb: Math.round(pending.blob.size / 1024) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function postAudio(blob: Blob, mime: string): Promise<string> {
    const form = new FormData();
    const ext = mime.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `note.${ext}`);
    form.append("language", language);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(transcribeUrl, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Error ${res.status}`);
      }
      const body = (await res.json()) as { text?: string };
      return (body.text ?? "").trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async function uploadAndTranscribe(blob: Blob, opts?: { skipPersist?: boolean }) {
    setState({ kind: "uploading" });
    const mime = mimeRef.current ?? blob.type ?? "audio/webm";
    if (!opts?.skipPersist) {
      await idbPut({ blob, mime, language, createdAt: Date.now() });
    }
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await postAudio(blob, mime);
        if (!text) {
          await idbDel();
          setState({ kind: "error", message: "Transcripción vacía", offerFallback: true });
          return;
        }
        await idbDel();
        onTranscript(text);
        setState({ kind: "idle" });
        return;
      } catch (e) {
        lastError = e;
        const aborted = e instanceof DOMException && e.name === "AbortError";
        const retriable = aborted || (e instanceof TypeError);
        if (!retriable || attempt === 1) break;
      }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    toast.error("No se pudo transcribir la nota", {
      description: `${message}. Audio guardado — puedes reintentar.`,
      duration: 12_000,
    });
    setState({ kind: "error", message, offerFallback: true });
  }

  async function retryPending() {
    const pending = await idbGet();
    if (!pending) {
      setState({ kind: "idle" });
      return;
    }
    mimeRef.current = pending.mime;
    void uploadAndTranscribe(pending.blob, { skipPersist: true });
  }

  async function discardPending() {
    await idbDel();
    setState({ kind: "idle" });
  }

  async function startRecording() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState({
        kind: "error",
        message: "Tu navegador no soporta grabación de audio.",
        offerFallback: true,
      });
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setState({
        kind: "error",
        message: "MediaRecorder no disponible.",
        offerFallback: true,
      });
      return;
    }

    setState({ kind: "permission" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Permiso denegado";
      setState({ kind: "error", message: msg, offerFallback: true });
      return;
    }
    streamRef.current = stream;
    const mimeType = pickMimeType();
    mimeRef.current = mimeType;
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeRef.current ?? "audio/webm",
      });
      releaseStream();
      if (blob.size === 0) {
        setState({ kind: "error", message: "No se grabó audio", offerFallback: true });
        return;
      }
      void uploadAndTranscribe(blob);
    };
    recorder.onerror = (ev: Event) => {
      const err = ev as Event & { error?: { message?: string } };
      const msg = err.error?.message ?? "Error de grabación";
      releaseStream();
      setState({ kind: "error", message: msg, offerFallback: true });
    };

    const startedAt = Date.now();
    recorder.start();
    setState({ kind: "recording", startedAt, elapsed: 0 });

    tickRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.kind !== "recording") return prev;
        const elapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
        if (elapsed >= HARD_STOP_SECONDS) {
          // Hard-stop: protege del timeout en Vercel Hobby.
          try {
            recorderRef.current?.stop();
          } catch {
            /* noop */
          }
          clearTick();
          toast.message("Nota cortada a 30s para evitar timeout.");
          return { kind: "recording", startedAt: prev.startedAt, elapsed };
        }
        return { kind: "recording", startedAt: prev.startedAt, elapsed };
      });
    }, 250);
  }

  function stopRecording() {
    clearTick();
    try {
      recorderRef.current?.stop();
    } catch {
      /* el onstop se encarga del cleanup */
    }
  }

  function runFallback() {
    const w = typeof window !== "undefined" ? (window as WindowWithSpeech) : null;
    const Ctor = w?.SpeechRecognition || w?.webkitSpeechRecognition;
    if (!Ctor) {
      setState({
        kind: "error",
        message: "Reconocimiento del navegador no soportado. Escribe la nota a mano.",
        offerFallback: false,
      });
      return;
    }
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = false;
    rec.interimResults = false;
    let finished = false;
    rec.onresult = (e) => {
      finished = true;
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      if (text) onTranscript(text);
      setState({ kind: "idle" });
    };
    rec.onerror = (e) => {
      finished = true;
      setState({
        kind: "error",
        message: `Reconocimiento falló: ${e.error ?? "desconocido"}`,
        offerFallback: false,
      });
    };
    rec.onend = () => {
      if (!finished) setState({ kind: "idle" });
    };
    fallbackRecRef.current = rec;
    try {
      rec.start();
      setState({ kind: "fallback-listening" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo iniciar reconocimiento";
      setState({ kind: "error", message: msg, offerFallback: false });
    }
  }

  function stopFallback() {
    try {
      fallbackRecRef.current?.stop();
    } catch {
      /* noop */
    }
  }

  // ---------- render ----------

  if (state.kind === "recoverable") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="flex-1">Hay una nota de voz sin enviar ({state.sizeKb} KB).</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void retryPending()}>
            Reintentar envío
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void discardPending()}>
            Descartar
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{state.message}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void retryPending()}>
            Reintentar
          </Button>
          {state.offerFallback && (
            <Button size="sm" variant="ghost" onClick={runFallback}>
              Probar reconocimiento del navegador
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (state.kind === "uploading") {
    return (
      <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Transcribiendo…
      </div>
    );
  }

  if (state.kind === "fallback-listening") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button size="sm" variant="destructive" onClick={stopFallback}>
          <Square className="h-3.5 w-3.5" />
          Parar
        </Button>
        <span className="text-xs text-muted-foreground">Escuchando (navegador)…</span>
      </div>
    );
  }

  if (state.kind === "recording") {
    const nearLimit = state.elapsed >= HARD_STOP_SECONDS - 5;
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button size="sm" variant="destructive" onClick={stopRecording}>
          <Square className="h-3.5 w-3.5" />
          Parar
        </Button>
        <span className={cn("flex items-center gap-1.5 text-xs", nearLimit ? "text-destructive" : "text-muted-foreground")}>
          <span className={cn("inline-block h-2 w-2 rounded-full", nearLimit ? "bg-destructive" : "bg-destructive/80", "animate-pulse")} />
          {formatElapsed(state.elapsed)} / 0:30
        </span>
      </div>
    );
  }

  // idle / permission
  const busy = state.kind === "permission";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        size="sm"
        variant="outline"
        onClick={startRecording}
        disabled={disabled || busy}
        title="Mantén las notas por debajo de 30 segundos"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
        {busy ? "Permiso…" : "Grabar"}
      </Button>
      <span className="text-[11px] text-muted-foreground">Hasta 30s</span>
    </div>
  );
}
