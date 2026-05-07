import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { logLlmCall } from "@/lib/llm-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // Whisper hard limit
const MODEL = "whisper-1";

export async function POST(req: Request) {
  // El middleware ya valida la cookie; si llegamos aquí estamos autenticados.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "missing 'audio' field" }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "empty audio" }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "audio too large (max 25MB)" }, { status: 413 });
  }

  const language = (form.get("language") as string | null) || "es";
  const filename = (audio as File).name || "audio.webm";
  const mime = audio.type || "audio/webm";

  // El SDK acepta cualquier File-like; reusamos el Blob recibido.
  const file = new File([audio], filename, { type: mime });

  const start = Date.now();
  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: MODEL,
      language,
      response_format: "json",
    });
    const durationMs = Date.now() - start;
    const text = (result as { text?: string }).text ?? "";
    void logLlmCall({
      purpose: "transcription",
      model: MODEL,
      durationMs,
      success: true,
      metadata: { bytes: audio.size, mime, language },
    });
    return NextResponse.json({ text, durationMs });
  } catch (e) {
    const durationMs = Date.now() - start;
    const message = e instanceof Error ? e.message : String(e);
    void logLlmCall({
      purpose: "transcription",
      model: MODEL,
      durationMs,
      success: false,
      errorMessage: message,
      metadata: { bytes: audio.size, mime, language },
    });
    console.error("transcribe failed", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
