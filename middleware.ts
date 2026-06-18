import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifyToken } from "@/lib/auth";
import { DEMO_COOKIE, verifyDemoToken } from "@/lib/demo/auth";

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

function isDemoRoute(pathname: string): boolean {
  return (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname === "/api/demo" ||
    pathname.startsWith("/api/demo/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Rutas públicas básicas.
  if (pathname === "/login") return passThrough(req);
  if (pathname.startsWith("/api/auth/")) return passThrough(req);

  // Endpoint público que inicia la sesión demo.
  if (pathname === "/api/demo/start") return passThrough(req);

  // Rutas de la demo: solo se entra con cookie demo válida; nunca con la real.
  if (isDemoRoute(pathname)) {
    const demoToken = req.cookies.get(DEMO_COOKIE)?.value;
    if (!demoToken) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "demo-session-required" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    const payload = await verifyDemoToken(demoToken);
    if (!payload) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "demo-session-invalid" }, { status: 401 });
      }
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      const res = NextResponse.redirect(url);
      res.cookies.delete(DEMO_COOKIE);
      return res;
    }
    return passThrough(req);
  }

  // Bypass de emergencia (solo afecta a rutas reales).
  if (process.env.BYPASS_AUTH === "true") return passThrough(req);

  // Routes con su propia auth (x-job-secret) — la ruta valida el header.
  if (req.headers.get("x-job-secret")) return passThrough(req);

  // Schedulers (Vercel Cron / cron-job.org) llaman a /api/jobs/* con
  // Authorization: Bearer <CRON_SECRET> en vez de cookie. Se deja pasar; la
  // ruta valida el secreto real (mismo patrón que x-job-secret).
  if (
    pathname.startsWith("/api/jobs/") &&
    req.headers.get("authorization")?.startsWith("Bearer ")
  ) {
    return passThrough(req);
  }

  // Rutas reales: exigen neonet-auth. La cookie demo NO concede acceso aquí
  // bajo ninguna circunstancia, para que un usuario demo no pueda ver datos
  // reales aunque manipule cookies.
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
