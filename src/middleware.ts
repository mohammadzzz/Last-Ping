import { NextRequest, NextResponse } from "next/server";

// Paths that must remain reachable without an owner session.
// Everything NOT matched here requires the `lp_owner` cookie.
const PUBLIC_EXACT = new Set<string>([
  "/login",
  "/favicon.ico",
  "/robots.txt",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  // Recipient self-serve flow (token + OTP gated by recipient guards)
  "/r/",
  "/api/r/",
  // Owner check-in via emailed/SMS link (PIN gated server-side)
  "/checkin/",
  "/api/checkin/link",
  // Auth bootstrap endpoints (login itself cannot require login)
  "/api/auth/login",
  "/api/auth/logout",
  // Liveness probe
  "/api/health",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix) return true;
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // Iron-session sets `lp_owner` only after successful login. Mere presence is
  // not proof of validity — page-level `requireOwner()` decrypts and verifies —
  // but absence is conclusive proof of "not logged in", so we can short-circuit
  // here as a hard outer gate that automatically covers any new route.
  const hasOwnerCookie = req.cookies.has("lp_owner");
  if (hasOwnerCookie) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = "/login";
  redirectUrl.search = "";
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    // Run on everything except Next internals and static asset extensions.
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|woff|woff2|ttf|otf)$).*)",
  ],
};
