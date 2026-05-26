// Resolve a stored thumbnail / feed image URL to a browser-loadable <img> src.
//
// - Public S3 objects in our own bucket load DIRECTLY (no proxy): they are
//   public-read and routing tens of thousands of node/feed images through the
//   server would be needless load + latency.
// - Local `/`-prefixed paths (legacy public/feed-images) pass through as-is.
// - Any other absolute URL (e.g. raw Instagram/Facebook CDN) goes through the
//   SSRF-guarded /api/proxy-image (its allowlist permits only IG/FB CDN hosts).
//
// Single source of truth shared by BrandPopup, BottomPanel and GraphCanvas so the
// S3-direct rule can't drift between consumers again.
// Our public feed bucket host. Kept in sync with next.config.ts CSP img-src.
const OWN_S3_HOST = "kikoai-wiki-web.s3.ap-northeast-2.amazonaws.com";

export function thumbSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    // Pin to our exact bucket host. A loose `.amazonaws.com` suffix match would
    // trust any AWS-hosted bucket (e.g. attacker.s3.amazonaws.com) as first-party.
    if (host === OWN_S3_HOST) return url;
  } catch {
    return null;
  }
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}
