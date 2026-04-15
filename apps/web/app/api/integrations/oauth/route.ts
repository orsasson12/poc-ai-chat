import { NextRequest } from "next/server";
import { z } from "zod";
import { getApiSession } from "@/lib/auth/session";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { getPlugin } from "@/lib/integrations/plugin";
import "@/lib/integrations"; // register plugins
import type { IntegrationProvider } from "@bizassist/types";

const startSchema = z.object({
  provider: z.enum(["shopify", "hubspot", "zendesk"]),
  assistantId: z.string().uuid(),
  shopDomain: z.string().optional(), // Shopify requires this
  subdomain: z.string().optional(),  // Zendesk requires this
});

/**
 * POST — Start OAuth flow. Returns the authorization URL to redirect to.
 */
export async function POST(request: NextRequest) {
  if (!hasDatabase()) {
    return Response.json({ url: "#mock-oauth" });
  }

  const session = await getApiSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, assistantId, shopDomain, subdomain } = parsed.data;

  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) return Response.json({ error: "Assistant not found" }, { status: 404 });

  const tenant = await queries.getTenantById(assistant.tenantId);
  if (!tenant || tenant.ownerId !== session.user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const plugin = getPlugin(provider as IntegrationProvider);
  if (!plugin) return Response.json({ error: "Unknown provider" }, { status: 400 });

  const oauthConfig = plugin.getOAuthConfig();
  if (!oauthConfig) {
    return Response.json({ error: `OAuth not configured for ${provider}` }, { status: 400 });
  }

  // Create integration record in "disconnected" state
  const integration = await queries.createIntegration({
    tenantId: assistant.tenantId,
    assistantId,
    provider: provider as IntegrationProvider,
    status: "disconnected",
    label: plugin.displayName,
    shopDomain: shopDomain ?? null,
    baseUrl: subdomain ? `https://${subdomain}.zendesk.com` : null,
  });

  // Build authorization URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/integrations/oauth/callback`;

  // State encodes: integrationId + tenantId (verified on callback)
  const state = Buffer.from(JSON.stringify({
    integrationId: integration.id,
    tenantId: assistant.tenantId,
    provider,
  })).toString("base64url");

  let authUrl = oauthConfig.authorizationUrl;
  // Substitute provider-specific placeholders
  if (shopDomain) authUrl = authUrl.replace("{shop}", shopDomain);
  if (subdomain) authUrl = authUrl.replace("{subdomain}", subdomain);

  const params = new URLSearchParams({
    client_id: oauthConfig.clientId,
    redirect_uri: redirectUri,
    scope: oauthConfig.scopes.join(provider === "shopify" ? "," : " "),
    state,
    response_type: "code",
  });

  return Response.json({ url: `${authUrl}?${params}` });
}
