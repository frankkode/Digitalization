/**
 * Request guard (Next.js proxy, formerly middleware), version 1.0 addition.
 * Protects the developer area with the signed session cookie from src/lib/auth.ts.
 * Client facing pages (intake, booking, quote) stay public.
 */
import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();   // demo mode without DASHBOARD_PASSWORD
  const ok = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/dashboard/:path*", "/outbox", "/api/kpi"] };
