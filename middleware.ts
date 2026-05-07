import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";

export const config = {
  matcher: [
    // Excluye assets de Next y archivos estáticos comunes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|map)$).*)",
  ],
};

// El layout raíz lee este header para decidir si renderizar la sidebar
// desktop. Cualquier salida que devuelva NextResponse.next() debe pasarlo.
function passThrough(req: NextRequest): NextResponse {
  const res = NextResponse.next();
  res.headers.set("x-pathname", req.nextUrl.pathname);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Rutas públicas
  if (pathname === "/login") return passThrough(req);
  if (pathname.startsWith("/api/auth/")) return passThrough(req);

  if (process.env.BYPASS_AUTH === "true") return passThrough(req);

  // Routes con su propia auth (x-job-secret) — la ruta valida el header.
  // Permite que curl manuales y los scripts de jobs sigan funcionando.
  if (req.headers.get("x-job-secret")) return passThrough(req);

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) return passThrough(req);
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?redirect=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}
