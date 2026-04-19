import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";

const createCustomerSchema = z.object({
  businessName: z.string().min(1).max(256),
  website: z.string().url().optional().or(z.literal("")),
  industry: z.string().max(128).optional(),
  greeting: z.string().max(1000).optional(),
  tone: z.enum(["professional", "friendly", "concise", "empathetic", "casual"]).optional(),
  avatarUrl: z.string().max(2_000_000).optional().or(z.literal("")),
  widgetColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  launcherAnimation: z.enum(["none", "pulse", "bounce", "attention_flash"]).optional(),
  launcherAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  launcherAnimationIntervalSec: z.number().int().min(4).max(30).optional(),
});

export async function GET() {
  if (!hasDatabase()) {
    return Response.json([]);
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const customers = await queries.getAllTenantsForOwner(session.user.id);
    return Response.json(customers);
  } catch (err) {
    console.error("Failed to list customers:", err);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const session = await getApiSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createCustomerSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { businessName, greeting, tone, avatarUrl, widgetColor, launcherAnimation, launcherAccentColor, launcherAnimationIntervalSec } = parsed.data;

  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  try {
    const { tenant, assistant } = await queries.createTenantWithAssistant(
      session.user.id,
      businessName,
      slug,
    );

    // Update assistant with custom settings if provided
    const updates: Record<string, string | number | boolean | null> = {};
    if (greeting) updates.greeting = greeting;
    if (tone) updates.tone = tone;
    if (avatarUrl) updates.avatarUrl = avatarUrl;
    if (widgetColor) updates.widgetColor = widgetColor;
    if (launcherAnimation) updates.launcherAnimation = launcherAnimation;
    if (launcherAccentColor) updates.launcherAccentColor = launcherAccentColor;
    if (launcherAnimationIntervalSec !== undefined) updates.launcherAnimationIntervalSec = launcherAnimationIntervalSec;

    if (Object.keys(updates).length > 0) {
      await queries.updateAssistant(assistant.id, tenant.id, updates);
    }

    return Response.json({ tenant, assistant }, { status: 201 });
  } catch (err) {
    console.error("Failed to create customer:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: "Failed to create customer", detail: message }, { status: 500 });
  }
}
