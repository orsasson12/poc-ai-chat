import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { calculateNextRefresh } from "@/lib/knowledge/refresh/scheduler";
import type { RefreshSchedule } from "@bizassist/types";

const updateSchema = z.object({
  knowledgeItemId: z.string().uuid(),
  tenantId: z.string().uuid(),
  schedule: z.enum(["manual", "daily", "weekly", "monthly"]),
});

export async function PUT(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ success: true });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const tenant = await queries.getTenantById(parsed.data.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const item = await queries.getKnowledgeItemById(parsed.data.knowledgeItemId);
  if (!item || item.tenantId !== parsed.data.tenantId) {
    return Response.json({ error: "Item not found" }, { status: 404 });
  }

  const schedule = parsed.data.schedule as RefreshSchedule;
  const nextRefresh = calculateNextRefresh(schedule);

  await queries.updateKnowledgeItem(item.id, item.tenantId, {
    refreshSchedule: schedule,
    nextRefreshAt: nextRefresh,
  });

  return Response.json({ success: true, nextRefreshAt: nextRefresh });
}
