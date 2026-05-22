import { NextRequest, NextResponse } from "next/server";
import { assertSafeRemoteUrl } from "@/lib/url-guard";

// @MX:NOTE: [AUTO] image proxy is intentionally restricted to Instagram/Facebook
//   CDN hosts via assertSafeRemoteUrl (SEC-02). It exists so the browser can load
//   short-lived IG CDN URLs that block cross-origin <img> requests; it must never
//   become a general-purpose fetch relay.

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("missing url", { status: 400 });

  // SSRF guard: scheme + host allowlist + private/loopback/link-local IP block
  // (resolves DNS and re-checks to defend against rebinding).
  const guard = await assertSafeRemoteUrl(url);
  if (!guard.ok) {
    return new NextResponse(guard.reason, { status: guard.status });
  }

  try {
    const res = await fetch(guard.url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // Do not auto-follow redirects: a 30x to an internal host would bypass the
      // guard we just ran. Treat a redirect as a failed fetch.
      redirect: "manual",
    });
    if (!res.ok) return new NextResponse("fetch failed", { status: 502 });

    const ct = res.headers.get("content-type") ?? "image/jpeg";
    // Only relay actual images — never HTML/JSON/text from an unexpected endpoint.
    if (!ct.startsWith("image/")) {
      return new NextResponse("not an image", { status: 400 });
    }

    const buf = await res.arrayBuffer();

    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400",
        // ACAO "*" removed (SEC-02): this proxy is consumed same-origin by our own
        // <img> tags, so no cross-origin allowance is needed.
      },
    });
  } catch {
    return new NextResponse("error", { status: 500 });
  }
}
