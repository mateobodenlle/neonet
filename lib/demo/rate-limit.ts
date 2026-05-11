import "server-only";

// Rate limit por IP con dos ventanas: día (cap duro) y minuto (anti-burst).
// In-memory: se reinicia al redeploy o cold start. Suficiente para frenar
// abuso casual sin Upstash.

interface Bucket {
  day: { count: number; resetAt: number };
  minute: { count: number; resetAt: number };
}

const DAY_LIMIT = 30;
const MINUTE_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const buckets: Map<string, Bucket> = (globalThis as never as {
  __demoRateLimit?: Map<string, Bucket>;
}).__demoRateLimit ?? new Map();
(globalThis as never as { __demoRateLimit?: Map<string, Bucket> }).__demoRateLimit = buckets;

// Bucket separado para transcripción (Whisper es más caro por llamada).
const transcribeBuckets: Map<string, Bucket> = (globalThis as never as {
  __demoTranscribeRateLimit?: Map<string, Bucket>;
}).__demoTranscribeRateLimit ?? new Map();
(globalThis as never as { __demoTranscribeRateLimit?: Map<string, Bucket> }).__demoTranscribeRateLimit = transcribeBuckets;

const TRANSCRIBE_DAY_LIMIT = 15;
const TRANSCRIBE_MINUTE_LIMIT = 3;

export interface RateLimitResult {
  ok: boolean;
  reason?: "minute" | "day";
  retryInSeconds?: number;
}

function consumeBucket(
  map: Map<string, Bucket>,
  ip: string,
  dayLimit: number,
  minuteLimit: number,
): RateLimitResult {
  const now = Date.now();
  let b = map.get(ip);
  if (!b) {
    b = {
      day: { count: 0, resetAt: now + DAY_MS },
      minute: { count: 0, resetAt: now + MINUTE_MS },
    };
    map.set(ip, b);
  }
  if (now >= b.day.resetAt) b.day = { count: 0, resetAt: now + DAY_MS };
  if (now >= b.minute.resetAt) b.minute = { count: 0, resetAt: now + MINUTE_MS };
  if (b.day.count >= dayLimit) {
    return { ok: false, reason: "day", retryInSeconds: Math.ceil((b.day.resetAt - now) / 1000) };
  }
  if (b.minute.count >= minuteLimit) {
    return { ok: false, reason: "minute", retryInSeconds: Math.ceil((b.minute.resetAt - now) / 1000) };
  }
  b.day.count += 1;
  b.minute.count += 1;
  return { ok: true };
}

export function consume(ip: string): RateLimitResult {
  return consumeBucket(buckets, ip, DAY_LIMIT, MINUTE_LIMIT);
}

export function consumeTranscribe(ip: string): RateLimitResult {
  return consumeBucket(transcribeBuckets, ip, TRANSCRIBE_DAY_LIMIT, TRANSCRIBE_MINUTE_LIMIT);
}
