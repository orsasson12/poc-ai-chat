/**
 * Integration module index.
 *
 * Importing this module registers all plugins.
 */

// Register all plugins
import "./plugins/shopify";
import "./plugins/hubspot";
import "./plugins/zendesk";
import "./plugins/generic-webhook";

// Re-export public API
export {
  getPlugin,
  getAllPlugins,
  buildToolSchemasForTenant,
  executeToolCall,
} from "./plugin";
export type { ToolSchema } from "./plugin";
export { sanitizeResult, formatResultForLLM } from "./sanitize";
