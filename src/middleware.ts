import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isAllowedOrigin, verifySession } from "@/lib/jwt";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Anti-CSRF (defesa extra além do SameSite=Strict): toda mutação na API exige Origin da própria app.
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method)) {
    if (!isAllowedOrigin(req.headers.get("origin"), req.headers.get("host"))) {
      return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
    }
  }

  const isAdminApi = pathname.startsWith("/api/admin");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  if ((!isAdminApi && !isAdminPage) || pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    if (isAdminApi) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
