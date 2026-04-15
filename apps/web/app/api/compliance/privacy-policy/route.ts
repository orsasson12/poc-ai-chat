import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getApiSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { hasDatabase } from "@/lib/env";
import { generatePrivacyPolicyMarkdown } from "@/lib/compliance/policy-template";

/**
 * GET /api/compliance/privacy-policy
 *
 * Returns a Markdown privacy policy snippet tailored to the caller's tenant
 * configuration. Query param `?format=download` streams the file as an
 * attachment instead of returning JSON.
 */
export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get("format");
  const today = new Date().toISOString().slice(0, 10);

  if (!hasDatabase()) {
    const markdown = generatePrivacyPolicyMarkdown({
      businessName: "Example Business",
      businessUrl: "https://example.com",
      contactEmail: "privacy@example.com",
      dataRegion: "eu",
      retentionDaysConversations: 365,
      retentionDaysLeads: 730,
      leadCaptureEnabled: true,
      cookielessMode: false,
      effectiveDate: today,
    });
    return format === "download"
      ? new Response(markdown, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="privacy-notice.md"`,
          },
        })
      : Response.json({ markdown });
  }

  const session = await getApiSession();
  if (!session || !session.tenantId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = getDb();
  if (!d) return Response.json({ error: "Database not configured" }, { status: 503 });

  const [tenant] = await d
    .select()
    .from(s.tenants)
    .where(eq(s.tenants.id, session.tenantId))
    .limit(1);

  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const [assistant] = await d
    .select({ cookielessMode: s.assistants.cookielessMode, escalationEmail: s.assistants.escalationEmail })
    .from(s.assistants)
    .where(eq(s.assistants.tenantId, session.tenantId))
    .limit(1);

  const markdown = generatePrivacyPolicyMarkdown({
    businessName: tenant.name,
    businessUrl: null,
    contactEmail: assistant?.escalationEmail ?? session.user.email,
    dataRegion: (tenant.dataRegion as "eu" | "us" | "auto") ?? "auto",
    retentionDaysConversations: tenant.retentionDaysConversations,
    retentionDaysLeads: tenant.retentionDaysLeads,
    leadCaptureEnabled: true,
    cookielessMode: assistant?.cookielessMode ?? false,
    effectiveDate: today,
  });

  if (format === "download") {
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="privacy-notice.md"`,
      },
    });
  }

  return Response.json({ markdown });
}
