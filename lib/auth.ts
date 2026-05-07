// Edge-safe JWT helpers — used by middleware (edge runtime) and the login
// route (node runtime). Keep this file free of node:* imports so it can be
// pulled into the middleware bundle.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const AUTH_COOKIE = "neonet-auth";
const ALG = "HS256";
const ISSUER = "neonet";

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

export async function signToken(payload: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setSubject("owner")
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: [ALG],
      issuer: ISSUER,
    });
    return payload;
  } catch {
    return null;
  }
}
