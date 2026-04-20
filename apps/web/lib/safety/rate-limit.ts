import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env, hasUpstash } from "@/lib/env";

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

interface LimiterLike {
  limit: (key: string) => Promise<LimitResult>;
}

function noopLimiter(): LimiterLike {
  return {
    async limit() {
      return { success: true, reset: 0, limit: 0, remaining: 0 };
    },
  };
}

function buildLimiter(
  prefix: string,
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
): LimiterLike {
  if (!hasUpstash()) return noopLimiter();
  const redis = new Redis({
    url: env.upstashRedisUrl,
    token: env.upstashRedisToken,
  });
  return new Ratelimit({ redis, limiter, prefix, analytics: false });
}

export const chatLimiter: LimiterLike = buildLimiter(
  "ratelimit:chat",
  Ratelimit.slidingWindow(60, "1 m"),
);

export const ingestLimiter: LimiterLike = buildLimiter(
  "ratelimit:ingest",
  Ratelimit.slidingWindow(10, "1 h"),
);
