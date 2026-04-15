import { IntegrationPlugin, registerPlugin } from "../plugin";
import type { OAuthConfig } from "../plugin";
import type { Integration, IntegrationActionDef, IntegrationActionResult, WebhookActionConfig } from "@bizassist/types";

class GenericWebhookPlugin extends IntegrationPlugin {
  readonly provider = "generic_webhook" as const;
  readonly displayName = "Custom Webhook";
  readonly description = "Connect to any REST API using configurable webhook actions";

  getActions(): IntegrationActionDef[] {
    // Static definition — actual actions come from per-integration webhookConfig
    return [];
  }

  /** Returns dynamic actions based on the integration's webhook config */
  getActionsForIntegration(integration: Integration): IntegrationActionDef[] {
    return (integration.webhookConfig ?? []).map((cfg) => ({
      name: cfg.actionName,
      description: cfg.description,
      provider: "generic_webhook" as const,
      parameters: cfg.parameters.map((p) => ({
        ...p,
        type: (p.type === "number" || p.type === "boolean" ? p.type : "string") as "string" | "number" | "boolean",
      })),
    }));
  }

  /** Override to build schemas from the integration-specific config */
  buildToolSchemasForIntegration(integration: Integration): { name: string; description: string; input_schema: unknown }[] {
    return this.getActionsForIntegration(integration).map((action) => ({
      name: `generic_webhook_${action.name}`,
      description: `[Custom] ${action.description}`,
      input_schema: {
        type: "object" as const,
        properties: Object.fromEntries(
          action.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
        ),
        required: action.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }));
  }

  async execute(actionName: string, params: Record<string, string>, integration: Integration): Promise<IntegrationActionResult> {
    const config = (integration.webhookConfig ?? []).find((c) => c.actionName === actionName);
    if (!config) {
      return { success: false, data: {}, error: `Unknown webhook action: ${actionName}`, strippedFields: [] };
    }

    const baseUrl = integration.baseUrl;
    if (!baseUrl) {
      return { success: false, data: {}, error: "Webhook base URL not configured", strippedFields: [] };
    }

    try {
      // Build URL with parameter substitution
      let path = config.path;
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`{{${key}}}`, encodeURIComponent(value));
      }
      const url = new URL(path, baseUrl);

      // Add query params
      if (config.queryParams) {
        for (const [key, template] of Object.entries(config.queryParams)) {
          let value = template;
          for (const [pk, pv] of Object.entries(params)) {
            value = value.replace(`{{${pk}}}`, pv);
          }
          url.searchParams.set(key, value);
        }
      }

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };
      // Inject API key if configured
      if (integration.apiKey) {
        headers["Authorization"] = `Bearer ${integration.apiKey}`;
      }

      // Build body for POST
      let body: string | undefined;
      if (config.method === "POST" && config.bodyTemplate) {
        let bodyStr = config.bodyTemplate;
        for (const [key, value] of Object.entries(params)) {
          bodyStr = bodyStr.replace(`{{${key}}}`, value);
        }
        body = bodyStr;
      }

      const res = await fetch(url.toString(), {
        method: config.method,
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        return { success: false, data: {}, error: `Webhook returned ${res.status}`, strippedFields: [] };
      }

      const responseData = await res.json();

      // Apply response mapping
      const mapped: Record<string, unknown> = {};
      for (const [displayField, jsonPath] of Object.entries(config.responseMapping)) {
        mapped[displayField] = extractJsonPath(responseData, jsonPath);
      }

      return { success: true, data: mapped, strippedFields: [] };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Webhook call failed", strippedFields: [] };
    }
  }

  async testConnection(integration: Integration): Promise<{ ok: boolean; error?: string }> {
    if (!integration.baseUrl) return { ok: false, error: "Missing base URL" };
    try {
      const res = await fetch(integration.baseUrl, {
        method: "HEAD",
        headers: integration.apiKey ? { Authorization: `Bearer ${integration.apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      // Accept any non-5xx response as "reachable"
      return res.status < 500 ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  getOAuthConfig(): OAuthConfig | null {
    return null; // Generic webhooks use API key auth
  }
}

/** Simple dot-notation JSON path extractor: "order.status" → data.order.status */
function extractJsonPath(data: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return current ?? null;
}

registerPlugin(new GenericWebhookPlugin());
