import type { NextConfig } from "next";

// SEC-10: conservative Content-Security-Policy. Tuned NOT to break the existing
// UI, which relies on:
//   - inline <style> blocks + inline style attributes (canvas/popup) → 'unsafe-inline' for style
//   - same-origin /api/proxy-image relaying Instagram CDN images → img-src self
//   - direct Instagram/Facebook CDN <img> URLs → img-src cdninstagram/fbcdn
//   - direct public S3 feed images (wiki-web bucket) → img-src the bucket host
//   - Pretendard webfont CSS from jsdelivr (app/layout.tsx) → style-src/font-src jsdelivr
//   - data:/blob: images used by the react-force-graph canvas
// Next.js dev/runtime needs 'unsafe-inline' (and 'unsafe-eval' in dev) for its
// inlined bootstrap scripts; tightening to nonces is a later hardening step.
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net https://kikoai-wiki-web.s3.ap-northeast-2.amazonaws.com",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
