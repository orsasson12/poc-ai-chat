import { NextRequest, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { getPlugin } from "@/lib/integrations/plugin";
import "@/lib/integrations"; // register plugins
import type { IntegrationProvider } from "@bizassist/types";

/**
 * GET — OAuth callback handler.
 * All providers redirect here after authorization.
 * Exchanges the code for tokens and stores them on the integration record.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=${encodeURIComponent(error)}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=missing_params`);
  }

  // Decode state
  let state: { integrationId: string; tenantId: string; provider: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=invalid_state`);
  }

  if (!hasDatabase()) {
    return NextResponse.redirect(`${appUrl}/customers?integration_success=mock`);
  }

  const integration = await queries.getIntegrationById(state.integrationId, state.tenantId);
  if (!integration) {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=not_found`);
  }

  const plugin = getPlugin(state.provider as IntegrationProvider);
  if (!plugin) {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=unknown_provider`);
  }

  const oauthConfig = plugin.getOAuthConfig();
  if (!oauthConfig) {
    return NextResponse.redirect(`${appUrl}/customers?integration_error=no_oauth`);
  }

  // Exchange code for tokens
  try {
    let tokenUrl = oauthConfig.tokenUrl;
    if (integration.shopDomain) tokenUrl = tokenUrl.replace("{shop}", integration.shopDomain);

    const redirectUri = `${appUrl}/api/integrations/oauth/callback`;

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error(`[OAuth ${state.provider}] Token exchange failed:`, errText);
      await queries.updateIntegration(integration.id, state.tenantId, {
        status: "error",
        lastError: `Token exchange failed: ${tokenRes.status}`,
      });
      return NextResponse.redirect(`${appUrl}/customers?integration_error=token_exchange`);
    }

    const tokens = await tokenRes.json();

    // Store tokens
    await queries.updateIntegration(integration.id, state.tenantId, {
      status: "connected",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      scopes: tokens.scope ?? oauthConfig.scopes.join(","),
      connectedAt: new Date(),
      lastError: null,
    });

    // Test the connection
    const testResult = await plugin.testConnection({
      ...integration,
      webhookConfig: integration.webhookConfig ?? [],
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
    } as Parameters<typeof plugin.testConnection>[0]);

    if (!testResult.ok) {
      await queries.updateIntegration(integration.id, state.tenantId, {
        status: "error",
        lastError: `Connection test failed: ${testResult.error}`,
      });
    }

    return NextResponse.redirect(`${appUrl}/customers?integration_success=${state.provider}`);
  } catch (err) {
    console.error(`[OAuth ${state.provider}] Callback error:`, err);
    await queries.updateIntegration(integration.id, state.tenantId, {
      status: "error",
      lastError: err instanceof Error ? err.message : "OAuth callback failed",
    });
    return NextResponse.redirect(`${appUrl}/customers?integration_error=callback_failed`);
  }
}
