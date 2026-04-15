import { IntegrationPlugin, registerPlugin } from "../plugin";
import type { OAuthConfig } from "../plugin";
import type { Integration, IntegrationActionDef, IntegrationActionResult } from "@bizassist/types";

class ZendeskPlugin extends IntegrationPlugin {
  readonly provider = "zendesk" as const;
  readonly displayName = "Zendesk";
  readonly description = "Look up tickets and customer support history from Zendesk";

  getActions(): IntegrationActionDef[] {
    return [
      {
        name: "get_ticket",
        description: "Look up a support ticket by ticket number. Use when a customer asks about their support ticket status.",
        provider: "zendesk",
        parameters: [
          { name: "ticket_id", type: "string", description: "Zendesk ticket number", required: true },
        ],
      },
      {
        name: "get_recent_tickets",
        description: "Find recent tickets for a customer by email. Use when a customer asks about their open or recent tickets.",
        provider: "zendesk",
        parameters: [
          { name: "email", type: "string", description: "Customer email address", required: true },
        ],
      },
    ];
  }

  async execute(actionName: string, params: Record<string, string>, integration: Integration): Promise<IntegrationActionResult> {
    const token = integration.accessToken;
    const baseUrl = integration.baseUrl; // e.g., https://mycompany.zendesk.com
    if (!token || !baseUrl) return { success: false, data: {}, error: "Zendesk not configured", strippedFields: [] };

    switch (actionName) {
      case "get_ticket": return this.getTicket(baseUrl, token, params);
      case "get_recent_tickets": return this.getRecentTickets(baseUrl, token, params);
      default: return { success: false, data: {}, error: `Unknown action: ${actionName}`, strippedFields: [] };
    }
  }

  async testConnection(integration: Integration): Promise<{ ok: boolean; error?: string }> {
    if (!integration.accessToken || !integration.baseUrl) return { ok: false, error: "Missing credentials" };
    try {
      const res = await fetch(`${integration.baseUrl}/api/v2/tickets.json?per_page=1`, {
        headers: { Authorization: `Bearer ${integration.accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  getOAuthConfig(): OAuthConfig | null {
    const clientId = process.env.ZENDESK_CLIENT_ID;
    const clientSecret = process.env.ZENDESK_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      authorizationUrl: "https://{subdomain}.zendesk.com/oauth/authorizations/new",
      tokenUrl: "https://{subdomain}.zendesk.com/oauth/tokens",
      clientId,
      clientSecret,
      scopes: ["tickets:read", "users:read"],
    };
  }

  private async getTicket(baseUrl: string, token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const res = await fetch(`${baseUrl}/api/v2/tickets/${params.ticket_id}.json`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) return { success: true, data: { result: "Ticket not found" }, strippedFields: [] };
      if (!res.ok) return { success: false, data: {}, error: `Zendesk API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const ticket = data.ticket;

      return {
        success: true,
        data: {
          ticket_id: `#${ticket.id}`,
          subject: ticket.subject,
          status: ticket.status,
          priority: ticket.priority ?? "normal",
          created_at: ticket.created_at,
          updated_at: ticket.updated_at,
          description: (ticket.description ?? "").slice(0, 300),
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }

  private async getRecentTickets(baseUrl: string, token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const query = encodeURIComponent(`type:ticket requester:${params.email} order_by:created_at sort:desc`);
      const res = await fetch(`${baseUrl}/api/v2/search.json?query=${query}&per_page=5`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `Zendesk API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const tickets = data.results ?? [];

      if (tickets.length === 0) {
        return { success: true, data: { result: "No tickets found for this email" }, strippedFields: [] };
      }

      const summaries = tickets.slice(0, 5).map((t: { id: number; subject: string; status: string; created_at: string }) => ({
        ticket_id: `#${t.id}`,
        subject: t.subject,
        status: t.status,
        created_at: t.created_at,
      }));

      return {
        success: true,
        data: { tickets: summaries, total_count: data.count ?? tickets.length },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }
}

registerPlugin(new ZendeskPlugin());
