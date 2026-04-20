import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

const dayScheduleSchema = z.object({
  day: z.number().min(0).max(6),
  open: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  close: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

const updateSchema = z.object({
  assistantId: z.string().uuid(),
  timezone: z.string().min(1).max(64),
  schedule: z.array(dayScheduleSchema).length(7),
  outsideHoursMsg: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  const assistantId = request.nextUrl.searchParams.get("assistantId");
  if (!assistantId) {
    return Response.json({ error: "assistantId required" }, { status: 400 });
  }

  if (!hasDatabase()) {
    return Response.json({
      timezone: "UTC",
      schedule: [
        { day: 0, open: null, close: null },
        { day: 1, open: "09:00", close: "17:00" },
        { day: 2, open: "09:00", close: "17:00" },
        { day: 3, open: "09:00", close: "17:00" },
        { day: 4, open: "09:00", close: "17:00" },
        { day: 5, open: "09:00", close: "17:00" },
        { day: 6, open: null, close: null },
      ],
      outsideHoursMsg: "We're currently outside business hours. Leave your email and we'll get back to you.",
    });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const hours = await queries.getBusinessHours(assistantId, assistant.tenantId);
  if (!hours) {
    return Response.json({
      timezone: "UTC",
      schedule: [
        { day: 0, open: null, close: null },
        { day: 1, open: "09:00", close: "17:00" },
        { day: 2, open: "09:00", close: "17:00" },
        { day: 3, open: "09:00", close: "17:00" },
        { day: 4, open: "09:00", close: "17:00" },
        { day: 5, open: "09:00", close: "17:00" },
        { day: 6, open: null, close: null },
      ],
      outsideHoursMsg: "We're currently outside business hours. Leave your email and we'll get back to you.",
    });
  }

  return Response.json({
    timezone: hours.timezone,
    schedule: hours.schedule,
    outsideHoursMsg: hours.outsideHoursMsg,
  });
}

export async function PUT(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const assistant = await queries.getAssistantById(parsed.data.assistantId);
  if (!assistant) {
    return Response.json({ error: "Assistant not found" }, { status: 404 });
  }

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await queries.upsertBusinessHours({
    tenantId: assistant.tenantId,
    assistantId: assistant.id,
    timezone: parsed.data.timezone,
    schedule: parsed.data.schedule,
    outsideHoursMsg: parsed.data.outsideHoursMsg ?? "We're currently outside business hours. Leave your email and we'll get back to you.",
  });

  return Response.json({ success: true });
}
