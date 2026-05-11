// Edge-safe JWT helpers para la sesión demo. Cookie y subject distintos al
// auth real para que el middleware pueda diferenciarlos sin ambigüedad.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const DEMO_COOKIE = "neonet-demo";
const ALG = "HS256";
const ISSUER = "neonet";
const SUBJECT = "demo";

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

export interface DemoTokenPayload extends JWTPayload {
  sid: string;
}

export async function signDemoToken(sid: string): Promise<string> {
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: ALG })
    .setSubject(SUBJECT)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime("6h")
    .sign(secret());
}

export async function verifyDemoToken(token: string): Promise<DemoTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: [ALG],
      issuer: ISSUER,
      subject: SUBJECT,
    });
    if (typeof payload.sid !== "string") return null;
    return payload as DemoTokenPayload;
  } catch {
    return null;
  }
}
