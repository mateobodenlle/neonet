import { NextResponse } from "next/server";
import { AUTH_COOKIE, signToken } from "@/lib/auth";

export const runtime = "edge";
export const dynamic = "force-dynamic";

// Comparación constante manual sobre strings ASCII. Necesaria porque
// node:crypto.timingSafeEqual no existe en edge runtime.
function safeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    console.error("login: APP_PASSWORD not set");
    return NextResponse.json({ error: "server-misconfigured" }, { status: 500 });
  }
  if (!password) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }
  if (!safeEqualStr(password, expected)) {
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const token = await signToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
