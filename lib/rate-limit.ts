// @MX:ANCHOR: [AUTO] in-memory IP rate limiter backing the proxy.ts request gate.
// @MX:REASON: this is the only throttle protecting the fully-public mutating API
//   and the *paid* Apify refresh endpoint (SEC-05 / cost-DoS). The sliding-window
//   state lives in a module-level Map.
//
// IMPORTANT: this store is PER-INSTANCE and resets on restart / does not share
// state across multiple Node processes or serverless invocations. It is an
// immediate single-instance safety net only. Production / multi-instance
// deployments MUST replace this with a shared store (Redis / Upstash
// @upstash/ratelimit) so limits are enforced globally.

interface Window {
  // Timestamps (ms) of requests still inside the window, oldest first.
  hits: number[];
}

const buckets = new Map<string, Window>();

// Periodically drop empty/expired buckets so the Map does not grow unbounded.
const MAX_WINDOW_MS = 60_000;
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < MAX_WINDOW_MS) return;
  lastSweep = now;
  for (const [key, win] of buckets) {
    if (win.hits.length === 0 || now - win.hits[win.hits.length - 1] > MAX_WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max requests allowed within the window. */
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (only meaningful when blocked). */
  retryAfter: number;
}

/**
 * Sliding-window counter keyed by `key` (caller passes IP + scope).
 * Returns whether the request is allowed and, if not, a Retry-After in seconds.
 */
export function rateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const windowStart = now - rule.windowMs;
  let win = buckets.get(key);
  if (!win) {
    win = { hits: [] };
    buckets.set(key, win);
  }

  // Drop hits that have aged out of the window.
  while (win.hits.length > 0 && win.hits[0] <= windowStart) {
    win.hits.shift();
  }

  if (win.hits.length >= rule.max) {
    const oldest = win.hits[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  win.hits.push(now);
  return { allowed: true, retryAfter: 0 };
}
