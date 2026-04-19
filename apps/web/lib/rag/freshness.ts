import { env } from "@/lib/env";

const MS_PER_DAY = 86_400_000;

export function freshnessBoost(
  ageMs: number,
  halfLifeMs: number = env.ragFreshnessHalfLifeDays * MS_PER_DAY,
  floor: number = env.ragFreshnessFloor,
): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  if (halfLifeMs <= 0) return 1;
  const decayed = Math.pow(0.5, ageMs / halfLifeMs);
  return Math.max(floor, decayed);
}

export function scoreChunk(
  pineconeScore: number,
  referenceDate: Date | null,
  now: number = Date.now(),
): { finalScore: number; decay: number; hasDate: boolean } {
  if (!referenceDate) {
    return { finalScore: pineconeScore, decay: 1, hasDate: false };
  }
  const ageMs = now - referenceDate.getTime();
  const decay = freshnessBoost(ageMs);
  return { finalScore: pineconeScore * decay, decay, hasDate: true };
}
