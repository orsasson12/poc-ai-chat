/**
 * Integration plugin abstract base.
 *
 * Each integration (Shopify, HubSpot, Zendesk, Generic Webhook) extends
 * this class. The plugin registry discovers available actions and builds
 * LLM tool-use schemas dynamically.
 */

import { z } from "zod";
import type {
  IntegrationProvider,
  IntegrationActionDef,
  IntegrationActionResult,
  Integration,
} from "@bizassist/types";

// ---- Abstract plugin base ----

export abstract class IntegrationPlugin {
  abstract readonly provider: IntegrationProvider;
  abstract readonly displayName: string;
  abstract readonly description: string;

  /** All actions this plugin exposes */
  abstract getActions(): IntegrationActionDef[];

  /** Execute an action by name with validated parameters */
  abstract execute(
    actionName: string,
    params: Record<string, string>,
    integration: Integration,
  ): Promise<IntegrationActionResult>;

  /** Validate that the connection is still working */
  abstract testConnection(integration: Integration): Promise<{ ok: boolean; error?: string }>;

  /** OAuth configuration (null for API-key-based integrations) */
  abstract getOAuthConfig(): OAuthConfig | null;

  /** Build LLM tool-use schema for Claude's tool calling */
  buildToolSchemas(): ToolSchema[] {
    return this.getActions().map((action) => ({
      name: `${this.provider}_${action.name}`,
      description: `[${this.displayName}] ${action.description}`,
      input_schema: {
        type: "object" as const,
        properties: Object.fromEntries(
          action.parameters.map((p) => [
            p.name,
            { type: p.type, description: p.description },
          ]),
        ),
        required: action.parameters.filter((p) => p.required).map((p) => p.name),
      },
    }));
  }
}

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  /** Additional params to send in the auth URL (e.g., Shopify needs shop domain) */
  extraAuthParams?: Record<string, string>;
}

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

// ---- Plugin registry ----

const registry = new Map<IntegrationProvider, IntegrationPlugin>();

export function registerPlugin(plugin: IntegrationPlugin): void {
  registry.set(plugin.provider, plugin);
}

export function getPlugin(provider: IntegrationProvider): IntegrationPlugin | null {
  return registry.get(provider) ?? null;
}

export function getAllPlugins(): IntegrationPlugin[] {
  return Array.from(registry.values());
}

/**
 * Builds tool schemas for all connected integrations of a tenant.
 * Used to dynamically inject tools into the LLM system prompt.
 */
export function buildToolSchemasForTenant(
  connectedIntegrations: Integration[],
): ToolSchema[] {
  const tools: ToolSchema[] = [];

  for (const integration of connectedIntegrations) {
    const plugin = getPlugin(integration.provider);
    if (!plugin) continue;
    tools.push(...plugin.buildToolSchemas());
  }

  return tools;
}

/**
 * Executes a tool call from the LLM.
 * Parses the tool name to find the plugin + action, validates params, executes.
 */
export async function executeToolCall(
  toolName: string,
  params: Record<string, string>,
  connectedIntegrations: Integration[],
): Promise<IntegrationActionResult> {
  // Parse tool name: "shopify_get_order" → provider=shopify, action=get_order
  const separatorIdx = toolName.indexOf("_");
  if (separatorIdx === -1) {
    return { success: false, data: {}, error: "Invalid tool name format", strippedFields: [] };
  }

  const provider = toolName.slice(0, separatorIdx) as IntegrationProvider;
  const actionName = toolName.slice(separatorIdx + 1);

  const plugin = getPlugin(provider);
  if (!plugin) {
    return { success: false, data: {}, error: `Unknown integration: ${provider}`, strippedFields: [] };
  }

  // Find the matching connected integration
  const integration = connectedIntegrations.find((i) => i.provider === provider);
  if (!integration) {
    return { success: false, data: {}, error: `${provider} is not connected`, strippedFields: [] };
  }

  // Check token expiry
  if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
    return { success: false, data: {}, error: `${provider} token expired — reconnection needed`, strippedFields: [] };
  }

  try {
    const result = await plugin.execute(actionName, params, integration);
    return result;
  } catch (err) {
    return {
      success: false,
      data: {},
      error: err instanceof Error ? err.message : "Integration call failed",
      strippedFields: [],
    };
  }
}
