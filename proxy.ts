import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit, type RateLimitRule } from "@/lib/rate-limit";

// @MX:ANCHOR: [AUTO] edge gate that rate-limits the public API (SEC-05).
// @MX:REASON: every /api/* request — including the *paid* Apify refresh — is
//   otherwise unauthenticated and unthrottled. This is the only IP-based limiter
//   in front of the mutating API and the cost-DoS surface. NOTE: backed by an
//   in-memory per-instance store (see lib/rate-limit.ts); production / multi-
//   instance MUST move to a shared store (Redis/Upstash).
//
// Next.js 16: the `middleware` file convention was renamed to `proxy`. This file
// MUST be named proxy.ts and export a function named `proxy` (or default).
// It runs in the Node.js runtime by default.

// General limit for all /api/* requests.
const GENERAL: RateLimitRule = { windowMs: 60_000, max: 60 };

// Tight limit for the paid Apify Instagram refresh — keep this small.
const REFRESH: RateLimitRule = { windowMs: 60_000, max: 2 };

// Matches POST /api/brands/<id>/refresh-instagram
const REFRESH_PATH = /^\/api\/brands\/[^/]+\/refresh-instagram\/?$/;

function clientIp(req: NextRequest): string {
  // x-forwarded-for is a comma-separated list; the first entry is the client.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    }
  );
}

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const ip = clientIp(req);

  // Tighter bucket for the costly refresh endpoint (independent of the general one).
  if (req.method === "POST" && REFRESH_PATH.test(pathname)) {
    const r = rateLimit(`refresh:${ip}`, REFRESH);
    if (!r.allowed) return tooMany(r.retryAfter);
  }

  // General per-IP limit for the whole API surface.
  const g = rateLimit(`api:${ip}`, GENERAL);
  if (!g.allowed) return tooMany(g.retryAfter);

  return NextResponse.next();
}

export const config = {
  // Only the API is rate-limited; static assets and pages are untouched.
  matcher: "/api/:path*",
};
