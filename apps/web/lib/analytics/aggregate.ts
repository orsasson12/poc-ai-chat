import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { hasDatabase } from "@/lib/env";

export interface RollupResult {
  tenantCount: number;
  daysProcessed: number;
  rowsUpserted: number;
}

/**
 * Compute and upsert analytics_daily rows for the given range.
 * Idempotent via ON CONFLICT.
 *
 * @param tenantId — if omitted, rolls up for every tenant
 * @param daysBack — number of days to recompute (default 1 = yesterday)
 */
export async function runDailyRollup(
  tenantId?: string,
  daysBack = 1,
): Promise<RollupResult> {
  if (!hasDatabase()) {
    return { tenantCount: 0, daysProcessed: daysBack, rowsUpserted: 0 };
  }
  const d = getDb();
  if (!d) {
    return { tenantCount: 0, daysProcessed: daysBack, rowsUpserted: 0 };
  }

  const startDate = new Date(Date.now() - daysBack * 86400000);
  const startIso = startDate.toISOString().slice(0, 10);

  const tenantFilter = tenantId
    ? sql`AND c.tenant_id = ${tenantId}`
    : sql``;

  const result = await d.execute<{ upserted: number }>(sql`
    WITH conv_agg AS (
      SELECT
        c.tenant_id,
        (c.started_at AT TIME ZONE 'UTC')::date AS day,
        COUNT(*) AS conversation_count,
        SUM(c.message_count) AS message_count,
        SUM(CASE WHEN c.escalated = false AND c.satisfaction >= 0 THEN 1 ELSE 0 END) AS deflected_count,
        SUM(CASE WHEN c.escalated = true THEN 1 ELSE 0 END) AS escalated_count,
        AVG(c.message_count)::numeric(6,2) AS avg_messages_per_conv,
        SUM(CASE WHEN c.satisfaction > 0 THEN 1 ELSE 0 END) AS positive_feedback,
        SUM(CASE WHEN c.satisfaction < 0 THEN 1 ELSE 0 END) AS negative_feedback
      FROM conversations c
      WHERE (c.started_at AT TIME ZONE 'UTC')::date >= ${startIso}::date
      ${tenantFilter}
      GROUP BY c.tenant_id, (c.started_at AT TIME ZONE 'UTC')::date
    ),
    msg_agg AS (
      SELECT
        m.tenant_id,
        (m.created_at AT TIME ZONE 'UTC')::date AS day,
        AVG(CAST(m.confidence AS float))::numeric(4,3) AS avg_confidence,
        AVG(m.latency_ms)::int AS avg_latency_ms,
        COALESCE(SUM(m.tokens_used), 0)::int AS tokens_used,
        SUM(CASE WHEN m.is_fallback = true THEN 1 ELSE 0 END) AS fallback_count
      FROM messages m
      WHERE (m.created_at AT TIME ZONE 'UTC')::date >= ${startIso}::date
        AND m.role = 'assistant'
      GROUP BY m.tenant_id, (m.created_at AT TIME ZONE 'UTC')::date
    ),
    tenant_cost AS (
      SELECT id AS tenant_id, cost_per_ticket_cents FROM tenants
    ),
    combined AS (
      SELECT
        ca.tenant_id,
        ca.day,
        ca.conversation_count,
        COALESCE(ca.message_count, 0) AS message_count,
        ca.deflected_count,
        ca.escalated_count,
        COALESCE(ma.fallback_count, 0) AS fallback_count,
        ma.avg_confidence,
        ma.avg_latency_ms,
        ca.avg_messages_per_conv,
        COALESCE(ma.tokens_used, 0) AS tokens_used,
        ca.positive_feedback,
        ca.negative_feedback,
        ca.deflected_count * COALESCE(tc.cost_per_ticket_cents, 500) AS estimated_savings_cents
      FROM conv_agg ca
      LEFT JOIN msg_agg ma ON ma.tenant_id = ca.tenant_id AND ma.day = ca.day
      LEFT JOIN tenant_cost tc ON tc.tenant_id = ca.tenant_id
    )
    INSERT INTO analytics_daily (
      tenant_id, date, conversation_count, message_count, deflected_count,
      escalated_count, fallback_count, avg_confidence, avg_latency_ms,
      avg_messages_per_conv, tokens_used, positive_feedback, negative_feedback,
      estimated_savings_cents
    )
    SELECT
      tenant_id, day, conversation_count, message_count, deflected_count,
      escalated_count, fallback_count, avg_confidence, avg_latency_ms,
      avg_messages_per_conv, tokens_used, positive_feedback, negative_feedback,
      estimated_savings_cents
    FROM combined
    ON CONFLICT (tenant_id, date) DO UPDATE SET
      conversation_count = EXCLUDED.conversation_count,
      message_count = EXCLUDED.message_count,
      deflected_count = EXCLUDED.deflected_count,
      escalated_count = EXCLUDED.escalated_count,
      fallback_count = EXCLUDED.fallback_count,
      avg_confidence = EXCLUDED.avg_confidence,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      avg_messages_per_conv = EXCLUDED.avg_messages_per_conv,
      tokens_used = EXCLUDED.tokens_used,
      positive_feedback = EXCLUDED.positive_feedback,
      negative_feedback = EXCLUDED.negative_feedback,
      estimated_savings_cents = EXCLUDED.estimated_savings_cents
    RETURNING 1 AS upserted
  `);

  const rowsUpserted = Array.isArray(result) ? result.length : 0;
  return {
    tenantCount: tenantId ? 1 : 0,
    daysProcessed: daysBack,
    rowsUpserted,
  };
}
