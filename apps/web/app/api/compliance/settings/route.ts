import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getApiSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";
import { isValidDataRegion } from "@/lib/region";
import { DPA_VERSION } from "@/lib/compliance/sub-processors";

const updateSchema = z.object({
  dataRegion: z.string().optional(),
  retentionDaysConversations: z.number().int().min(0).max(3650).optional(),
  retentionDaysLeads: z.number().int().min(0).max(3650).optional(),
  retentionDaysSecurityEvents: z.number().int().min(0).max(3650).optional(),
  aiDisclosureMode: z.enum(["banner", "inline", "off"]).optional(),
  aiDisclosureText: z.string().max(500).nullable().optional(),
  cookielessMode: z.boolean().optional(),
  acceptDpa: z.boolean().optional(),
});

export async function GET(_request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({
      dataRegion: "auto",
      retentionDaysConversations: 365,
      retentionDaysLeads: 730,
      retentionDaysSecurityEvents: 180,
      aiDisclosureMode: "banner",
      aiDisclosureText: null,
      cookielessMode: false,
      dpaAcceptedAt: null,
      dpaAcceptedVersion: null,
      currentDpaVersion: DPA_VERSION,
    });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = getDb();
  if (!d) return Response.json({ error: "Database not configured" }, { status: 503 });

  const [tenant] = await d
    .select({
      dataRegion: s.tenants.dataRegion,
      retentionDaysConversations: s.tenants.retentionDaysConversations,
      retentionDaysLeads: s.tenants.retentionDaysLeads,
      retentionDaysSecurityEvents: s.tenants.retentionDaysSecurityEvents,
      aiDisclosureMode: s.tenants.aiDisclosureMode,
      aiDisclosureText: s.tenants.aiDisclosureText,
      dpaAcceptedAt: s.tenants.dpaAcceptedAt,
      dpaAcceptedVersion: s.tenants.dpaAcceptedVersion,
    })
    .from(s.tenants)
    .where(eq(s.tenants.id, session.tenantId))
    .limit(1);

  const [assistant] = await d
    .select({ cookielessMode: s.assistants.cookielessMode })
    .from(s.assistants)
    .where(eq(s.assistants.tenantId, session.tenantId))
    .limit(1);

  return Response.json({
    ...tenant,
    dpaAcceptedAt: tenant?.dpaAcceptedAt?.toISOString() ?? null,
    cookielessMode: assistant?.cookielessMode ?? false,
    currentDpaVersion: DPA_VERSION,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.dataRegion && !isValidDataRegion(parsed.data.dataRegion)) {
    return Response.json({ error: "Invalid dataRegion" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({ ok: true, mock: true });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = getDb();
  if (!d) return Response.json({ error: "Database not configured" }, { status: 503 });

  const tenantUpdate: Record<string, unknown> = {};
  if (parsed.data.dataRegion !== undefined) tenantUpdate.dataRegion = parsed.data.dataRegion;
  if (parsed.data.retentionDaysConversations !== undefined)
    tenantUpdate.retentionDaysConversations = parsed.data.retentionDaysConversations;
  if (parsed.data.retentionDaysLeads !== undefined)
    tenantUpdate.retentionDaysLeads = parsed.data.retentionDaysLeads;
  if (parsed.data.retentionDaysSecurityEvents !== undefined)
    tenantUpdate.retentionDaysSecurityEvents = parsed.data.retentionDaysSecurityEvents;
  if (parsed.data.aiDisclosureMode !== undefined)
    tenantUpdate.aiDisclosureMode = parsed.data.aiDisclosureMode;
  if (parsed.data.aiDisclosureText !== undefined)
    tenantUpdate.aiDisclosureText = parsed.data.aiDisclosureText;
  if (parsed.data.acceptDpa === true) {
    tenantUpdate.dpaAcceptedAt = new Date();
    tenantUpdate.dpaAcceptedVersion = DPA_VERSION;
  }

  if (Object.keys(tenantUpdate).length > 0) {
    await d.update(s.tenants).set(tenantUpdate).where(eq(s.tenants.id, session.tenantId));
  }

  if (parsed.data.cookielessMode !== undefined) {
    await d
      .update(s.assistants)
      .set({ cookielessMode: parsed.data.cookielessMode })
      .where(eq(s.assistants.tenantId, session.tenantId));
  }

  return Response.json({ ok: true });
}
