import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { DEMO_COOKIE, signDemoToken } from "@/lib/demo/auth";

export const runtime = "nodejs";

export async function POST() {
  const sid = randomUUID();
  const token = await signDemoToken(sid);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 6 * 60 * 60,
  });
  return res;
}
