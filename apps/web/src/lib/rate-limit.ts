/**
 * In-process rate limiting.
 *
 * Deliberately simple and dependency-free: a fixed-window counter keyed by an
 * identity string. This is a burst/vandalism guard, not a billing meter — it
 * protects the worker from a runaway client and stops one IP from filling the
 * database. In a multi-instance deployment swap this for Redis; the call sites
 * only use `rateLimit()`.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  // Stop unbounded growth from spoofed keys.
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k);
    }
    if (windows.size > MAX_TRACKED_KEYS) windows.clear();
  }

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    windows.set(key, fresh);
    return { allowed: true, remaining: limit - 1, resetAt: fresh.resetAt, limit };
  }

  existing.count += 1;
  const allowed = existing.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
    limit,
  };
}

/**
 * Best-effort client identity.
 *
 * Behind a proxy these headers are attacker-controlled, which is fine for a
 * burst guard and explicitly *not* fine for anything security-critical. Auth
 * must never depend on this value.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/** Test/ops hook. */
export function resetRateLimits(): void {
  windows.clear();
}

export const LIMITS = {
  upload: { limit: 30, windowMs: 60_000 },
  export: { limit: 120, windowMs: 60_000 },
  read: { limit: 600, windowMs: 60_000 },
} as const;
