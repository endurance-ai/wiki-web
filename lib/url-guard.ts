import "server-only";
import { lookup } from "dns/promises";

// @MX:ANCHOR: [AUTO] SSRF guard — single source of truth for which remote URLs the
//   server is allowed to fetch (proxy-image route + image-storage downloader).
// @MX:REASON: both the public /api/proxy-image handler and downloadFeedImages fetch
//   attacker-influenced URLs server-side. A gap in either path re-opens the SEC-02
//   SSRF (cloud metadata 169.254.169.254, dev-app private 172.31.x.x). Keeping the
//   allowlist + private-range logic in one place prevents the two call sites from
//   drifting apart.

// Instagram / Facebook CDN hosts that legitimately serve brand feed images.
// Exact hostnames plus suffix matches (scontent.* / *.cdninstagram.com / *.fbcdn.net).
const ALLOWED_EXACT_HOSTS = new Set<string>([
  "instagram.com",
  "www.instagram.com",
  "cdninstagram.com",
  "fbcdn.net",
]);

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_EXACT_HOSTS.has(host)) return true;
  // Instagram CDN families. `scontent.*` covers scontent.cdninstagram.com,
  // scontent-xxx-1.cdninstagram.com, scontent.fxxx-1.fna.fbcdn.net, etc.
  if (host.endsWith(".cdninstagram.com")) return true;
  if (host.endsWith(".fbcdn.net")) return true;
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return true;
  if (host.startsWith("scontent.") || host.startsWith("scontent-")) return true;
  return false;
}

// Private / loopback / link-local / unique-local ranges that must never be
// reachable from a server-side fetch (defends both IP-literal hosts and DNS
// rebinding where a public hostname resolves to an internal address).
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  let host = ip.toLowerCase();
  // Strip zone id and brackets if present.
  host = host.replace(/^\[|\]$/g, "").split("%")[0];
  if (host === "::1" || host === "::") return true; // loopback / unspecified
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — check the embedded v4.
  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // fc00::/7 unique-local (fc.. / fd..) and fe80::/10 link-local.
  if (host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
    return true;
  }
  return false;
}

function isPrivateIP(ip: string): boolean {
  if (ip.includes(":")) return isPrivateIPv6(ip);
  return isPrivateIPv4(ip);
}

// Detect whether a hostname is itself an IP literal (so we never accept a raw
// 169.254.169.254 / [::1] even if it somehow passed the host allowlist).
function isIPLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true; // IPv4
  if (host.includes(":")) return true; // any IPv6 literal
  return false;
}

export type UrlGuardResult =
  | { ok: true; url: URL }
  | { ok: false; status: number; reason: string };

/**
 * Validate an attacker-influenced URL before the server fetches it.
 *
 * Enforces, in order:
 *   1. parseable URL
 *   2. http/https scheme only
 *   3. hostname is NOT an IP literal in a private/loopback/link-local range
 *   4. hostname is on the Instagram/Facebook CDN allowlist
 *   5. resolved DNS addresses are NOT in a private/loopback/link-local range
 *      (DNS-rebinding defense)
 */
export async function assertSafeRemoteUrl(raw: string): Promise<UrlGuardResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, status: 400, reason: "invalid url" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, status: 400, reason: "scheme not allowed" };
  }

  const hostname = url.hostname;

  // Reject IP literals that fall in a blocked range outright.
  if (isIPLiteral(hostname)) {
    const bare = hostname.replace(/^\[|\]$/g, "");
    if (isPrivateIP(bare)) {
      return { ok: false, status: 400, reason: "private address blocked" };
    }
    // A bare public IP literal is not on the host allowlist → reject.
    return { ok: false, status: 400, reason: "host not allowed" };
  }

  if (!isAllowedHost(hostname)) {
    return { ok: false, status: 400, reason: "host not allowed" };
  }

  // Resolve and re-check: a hostname on the allowlist could still (via poisoning
  // or rebinding) point at an internal address. Block if any resolved A/AAAA is private.
  try {
    const records = await lookup(hostname, { all: true });
    for (const rec of records) {
      if (isPrivateIP(rec.address)) {
        return { ok: false, status: 400, reason: "resolves to private address" };
      }
    }
  } catch {
    return { ok: false, status: 400, reason: "dns resolution failed" };
  }

  return { ok: true, url };
}

// Synchronous host-only check (no DNS) for callers that just need to filter a
// batch of URLs cheaply before the per-URL async guard runs.
export function isAllowedRemoteHost(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (isIPLiteral(url.hostname)) return false;
  return isAllowedHost(url.hostname);
}
