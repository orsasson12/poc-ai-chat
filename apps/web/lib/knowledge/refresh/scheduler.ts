/**
 * Knowledge refresh scheduler.
 *
 * Calculates the next refresh time based on schedule type and handles
 * rate limiting to avoid overwhelming business owners' websites.
 */

import type { RefreshSchedule } from "@bizassist/types";

const SCHEDULE_INTERVALS: Record<RefreshSchedule, number> = {
  manual: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Calculates when the next refresh should happen.
 */
export function calculateNextRefresh(
  schedule: RefreshSchedule,
  fromDate: Date = new Date(),
): Date | null {
  if (schedule === "manual") return null;
  return new Date(fromDate.getTime() + SCHEDULE_INTERVALS[schedule]);
}

// ---- Rate limiting for scraping ----

/**
 * Per-domain rate limiter to avoid overwhelming target websites.
 * Ensures at most 1 request per domain per 5 seconds.
 */
const domainLastScrape = new Map<string, number>();
const MIN_DOMAIN_INTERVAL_MS = 5000;

export function canScrapeDomain(url: string): boolean {
  try {
    const domain = new URL(url).hostname;
    const lastScrape = domainLastScrape.get(domain);
    if (!lastScrape) return true;
    return Date.now() - lastScrape >= MIN_DOMAIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function markDomainScraped(url: string): void {
  try {
    const domain = new URL(url).hostname;
    domainLastScrape.set(domain, Date.now());
  } catch { /* ignore */ }
}

/**
 * Waits until the domain's rate limit window opens.
 * Returns immediately if the domain is available.
 */
export async function waitForDomainSlot(url: string): Promise<void> {
  while (!canScrapeDomain(url)) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---- Robots.txt checking ----

const robotsCache = new Map<string, { rules: string; fetchedAt: number }>();
const ROBOTS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function isAllowedByRobots(url: string, userAgent = "BizAssistBot"): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    const pathname = new URL(url).pathname;

    // Check cache
    const cached = robotsCache.get(origin);
    if (cached && Date.now() - cached.fetchedAt < ROBOTS_CACHE_TTL) {
      return parseRobotsTxt(cached.rules, pathname, userAgent);
    }

    // Fetch robots.txt
    const res = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": userAgent },
    });

    if (!res.ok) {
      // No robots.txt or error → allow
      return true;
    }

    const rules = await res.text();
    robotsCache.set(origin, { rules, fetchedAt: Date.now() });
    return parseRobotsTxt(rules, pathname, userAgent);
  } catch {
    // On error, allow (fail open)
    return true;
  }
}

function parseRobotsTxt(rules: string, pathname: string, userAgent: string): boolean {
  const lines = rules.split("\n").map((l) => l.trim());
  let inRelevantBlock = false;
  let foundDisallow = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith("user-agent:")) {
      const agent = line.slice("user-agent:".length).trim();
      inRelevantBlock = agent === "*" || agent.toLowerCase() === userAgent.toLowerCase();
    } else if (inRelevantBlock && line.toLowerCase().startsWith("disallow:")) {
      const path = line.slice("disallow:".length).trim();
      if (path && pathname.startsWith(path)) {
        foundDisallow = true;
      }
    } else if (inRelevantBlock && line.toLowerCase().startsWith("allow:")) {
      const path = line.slice("allow:".length).trim();
      if (path && pathname.startsWith(path)) {
        foundDisallow = false;
      }
    }
  }

  return !foundDisallow;
}
