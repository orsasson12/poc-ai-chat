import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { updateAssistant } from "@/lib/db/queries";
import { hasDatabase } from "@/lib/env";

const assistantSettingsSchema = z.object({
  assistantId: z.string().uuid(),
  name: z.string().min(1).max(256).optional(),
  greeting: z.string().max(1000).optional(),
  tone: z.string().max(64).optional(),
  fallbackMsg: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  widgetColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  widgetPosition: z.enum(["bottom-right", "bottom-left"]).optional(),
});

export async function PUT(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ success: true, message: "Mock mode — changes not persisted" });
  }

  const session = await getApiSession();
  if (!session?.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = assistantSettingsSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { assistantId, ...data } = parsed.data;

  await updateAssistant(assistantId, session.tenantId, data);

  return Response.json({ success: true });
}
