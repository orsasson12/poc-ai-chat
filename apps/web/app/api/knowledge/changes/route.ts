import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { reEmbedKnowledgeItem } from "@/lib/knowledge/refresh/re-embed";

/** GET — List pending changes for a tenant */
export async function GET(request: NextRequest) {
  const tenantId = request.nextUrl.searchParams.get("tenantId");
  if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

  if (!hasDatabase()) return Response.json([]);

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await queries.getTenantById(tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const changes = await queries.getPendingChanges(tenantId);
  return Response.json(changes);
}

/** PATCH — Approve or reject a change */
const actionSchema = z.object({
  changeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reviewNote: z.string().max(500).optional(),
});

export async function PATCH(request: NextRequest) {
  if (!hasDatabase()) return Response.json({ success: true });

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const tenant = await queries.getTenantById(parsed.data.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { changeId, tenantId, action, reviewNote } = parsed.data;

  await queries.updateChangeApproval(changeId, tenantId, {
    approval: action === "approve" ? "approved" : "rejected",
    reviewedBy: session.user.id,
    reviewNote,
  });

  if (action === "approve") {
    // Get the change entry to apply it
    const changes = await queries.getChangeLog("", tenantId); // TODO: get by changeId
    const change = changes.find((c) => c.id === changeId);

    if (change) {
      try {
        await reEmbedKnowledgeItem(
          change.knowledgeItemId,
          tenantId,
          change.newContent,
          change.newTitle ?? undefined,
        );
      } catch (err) {
        console.error("[change approval] Re-embed failed:", err);
      }

      // Clear pending change reference
      await queries.updateRefreshStatus(change.knowledgeItemId, tenantId, {
        pendingChangeId: null,
        refreshStatus: "ok",
      });
    }
  } else {
    // Rejected — clear pending change reference but keep old content
    // Find the item via the change log
    const allChanges = await queries.getPendingChanges(tenantId);
    const change = allChanges.find((c) => c.id === changeId);
    if (change) {
      await queries.updateRefreshStatus(change.knowledgeItemId, tenantId, {
        pendingChangeId: null,
        refreshStatus: "ok",
      });
    }
  }

  return Response.json({ success: true, action });
}
