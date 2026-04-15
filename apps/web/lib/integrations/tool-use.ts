/**
 * LLM tool-use integration.
 *
 * Dynamically injects integration tools into the Claude system prompt
 * based on which integrations the tenant has connected. Handles tool
 * call execution, result sanitization, and audit logging.
 */

import type { Integration, IntegrationProvider } from "@bizassist/types";
import * as queries from "@/lib/db/queries";
import {
  buildToolSchemasForTenant,
  executeToolCall,
  getPlugin,
} from "./plugin";
import type { ToolSchema } from "./plugin";
import { sanitizeResult, formatResultForLLM } from "./sanitize";

// Register all plugins
import "./plugins/shopify";
import "./plugins/hubspot";
import "./plugins/zendesk";
import "./plugins/generic-webhook";

/**
 * Builds the tools array for Claude's API based on a tenant's integrations.
 * Returns empty array if no integrations are connected.
 */
export async function getToolsForTenant(
  tenantId: string,
  assistantId: string,
): Promise<{ tools: ToolSchema[]; integrations: Integration[] }> {
  let connectedIntegrations: Integration[];
  try {
    const rows = await queries.getConnectedIntegrations(tenantId, assistantId);
    connectedIntegrations = rows.map((r) => ({
      ...r,
      webhookConfig: r.webhookConfig ?? [],
    })) as Integration[];
  } catch {
    return { tools: [], integrations: [] };
  }

  if (connectedIntegrations.length === 0) {
    return { tools: [], integrations: [] };
  }

  // Build standard tool schemas
  const tools = buildToolSchemasForTenant(connectedIntegrations);

  // Add generic webhook tools (dynamic per-integration)
  for (const integration of connectedIntegrations) {
    if (integration.provider === "generic_webhook") {
      const plugin = getPlugin("generic_webhook");
      if (plugin && "buildToolSchemasForIntegration" in plugin) {
        const webhookSchemas = (plugin as { buildToolSchemasForIntegration: (i: Integration) => ToolSchema[] })
          .buildToolSchemasForIntegration(integration);
        tools.push(...webhookSchemas);
      }
    }
  }

  return { tools, integrations: connectedIntegrations };
}

/**
 * Builds a system prompt addendum describing available integration tools.
 * Injected after the main system prompt.
 */
export function buildIntegrationPromptAddendum(tools: ToolSchema[]): string {
  if (tools.length === 0) return "";

  return `

BACKEND INTEGRATIONS:
You have access to real-time business system lookups. When a customer asks about their order, ticket, account, or any data that requires a lookup, use the appropriate tool.

Rules for using integrations:
- Only call a tool when the customer's question clearly requires a lookup (e.g., "Where is my order?", "What's the status of my ticket?").
- Ask the customer for the required information (order number, email, ticket ID) before calling the tool. Do not guess.
- If a tool call fails, apologize and suggest the customer contact support directly. Do not retry automatically.
- Present the results naturally in your response. Do not show raw field names or JSON.
- Never reveal that you're calling an external system. Present information as if you naturally have access to it.
- If the result contains [EMAIL], [PHONE], or other redacted markers, do not mention the redaction.
`;
}

/**
 * Handles a tool_use response from Claude.
 * Executes the integration call, sanitizes the result, logs it, and
 * returns formatted text for injection into the next LLM turn.
 */
export async function handleToolCall(opts: {
  toolName: string;
  toolInput: Record<string, string>;
  integrations: Integration[];
  tenantId: string;
  conversationId: string | null;
}): Promise<string> {
  const startTime = Date.now();

  // Execute the tool call
  const rawResult = await executeToolCall(
    opts.toolName,
    opts.toolInput,
    opts.integrations,
  );

  // Sanitize: PII strip + data minimization
  const sanitized = sanitizeResult(rawResult);

  const latencyMs = Date.now() - startTime;

  // Resolve provider and integration for audit
  const separatorIdx = opts.toolName.indexOf("_");
  const provider = opts.toolName.slice(0, separatorIdx) as IntegrationProvider;
  const actionName = opts.toolName.slice(separatorIdx + 1);
  const integration = opts.integrations.find((i) => i.provider === provider);

  // Audit log
  if (integration) {
    try {
      await queries.createAuditEntry({
        tenantId: opts.tenantId,
        integrationId: integration.id,
        conversationId: opts.conversationId,
        actionName,
        provider,
        inputParams: opts.toolInput,
        success: sanitized.success,
        responseStatus: null,
        responseFields: sanitized.data,
        errorMessage: sanitized.error ?? null,
        latencyMs,
        piiDetected: sanitized.strippedFields.length > 0,
        piiFieldsStripped: sanitized.strippedFields,
      });

      await queries.incrementIntegrationCallCount(integration.id, opts.tenantId);
    } catch (err) {
      console.error("[Integration audit] Failed to log:", err);
    }
  }

  // Format for LLM consumption
  const plugin = getPlugin(provider);
  const label = plugin?.displayName ?? provider;
  return formatResultForLLM(actionName, label, sanitized);
}
