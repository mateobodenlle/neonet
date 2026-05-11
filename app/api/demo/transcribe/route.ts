import { NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { consumeTranscribe } from "@/lib/demo/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whisper hard limit. Para demo además recortamos a 4 MB para evitar abuso.
const MAX_BYTES = 4 * 1024 * 1024;
const MODEL = "whisper-1";

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: Request) {
  // El middleware ya valida la cookie demo. Aquí solo aplicamos rate limit.
  const ip = clientIp(req);
  const rl = consumeTranscribe(ip);
  if (!rl.ok) {
    const msg =
      rl.reason === "day"
        ? "Has alcanzado el límite diario de transcripciones de la demo."
        : `Demasiadas transcripciones seguidas. Espera ${rl.retryInSeconds ?? 60}s.`;
    return NextResponse.json({ error: msg }, { status: 429 });
  }

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
    return NextResponse.json({ error: "audio too large (max 4MB en demo)" }, { status: 413 });
  }

  const language = (form.get("language") as string | null) || "es";
  const filename = (audio as File).name || "audio.webm";
  const mime = audio.type || "audio/webm";
  const file = new File([audio], filename, { type: mime });

  try {
    const result = await openai.audio.transcriptions.create({
      file,
      model: MODEL,
      language,
      response_format: "json",
    });
    const text = (result as { text?: string }).text ?? "";
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
