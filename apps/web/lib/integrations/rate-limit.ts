/**
 * Per-tenant integration rate limiter.
 *
 * Prevents abuse by limiting how many integration calls a tenant
 * can make per minute. Uses an in-memory sliding window.
 * In production, this would use Upstash Redis.
 */

// In-memory rate limit store (per-tenant, per-minute)
const windows = new Map<string, { count: number; resetAt: number }>();

const DEFAULT_LIMIT = 30; // calls per minute per tenant
const WINDOW_MS = 60_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkIntegrationRateLimit(
  tenantId: string,
  limit: number = DEFAULT_LIMIT,
): RateLimitResult {
  const now = Date.now();
  const key = `integration:${tenantId}`;

  let window = windows.get(key);

  // Reset window if expired
  if (!window || now > window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, window);
  }

  if (window.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: window.resetAt };
  }

  window.count++;
  return { allowed: true, remaining: limit - window.count, resetAt: window.resetAt };
}

/**
 * Cleanup stale windows periodically (prevent memory leak).
 * Call this on a timer or at the start of request handling.
 */
export function cleanupStaleWindows(): void {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (now > window.resetAt + WINDOW_MS) {
      windows.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleWindows, 5 * 60_000);
}
