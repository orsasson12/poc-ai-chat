import { IntegrationPlugin, registerPlugin } from "../plugin";
import type { OAuthConfig } from "../plugin";
import type { Integration, IntegrationActionDef, IntegrationActionResult } from "@bizassist/types";

const HUBSPOT_API = "https://api.hubapi.com";

class HubSpotPlugin extends IntegrationPlugin {
  readonly provider = "hubspot" as const;
  readonly displayName = "HubSpot CRM";
  readonly description = "Look up contacts, deals, and company info from HubSpot";

  getActions(): IntegrationActionDef[] {
    return [
      {
        name: "get_contact",
        description: "Look up a contact by email in the CRM. Use when a customer asks about their account or you need to identify them.",
        provider: "hubspot",
        parameters: [
          { name: "email", type: "string", description: "Contact email address", required: true },
        ],
      },
      {
        name: "get_deal",
        description: "Look up a deal by name or deal ID. Use when a customer asks about a quote, proposal, or deal status.",
        provider: "hubspot",
        parameters: [
          { name: "deal_name", type: "string", description: "Name or partial name of the deal", required: false },
          { name: "deal_id", type: "string", description: "HubSpot deal ID", required: false },
        ],
      },
      {
        name: "get_company",
        description: "Look up company information. Use when a customer asks about a company or organization.",
        provider: "hubspot",
        parameters: [
          { name: "company_name", type: "string", description: "Company name to search for", required: true },
        ],
      },
    ];
  }

  async execute(actionName: string, params: Record<string, string>, integration: Integration): Promise<IntegrationActionResult> {
    const token = integration.accessToken;
    if (!token) return { success: false, data: {}, error: "HubSpot not configured", strippedFields: [] };

    switch (actionName) {
      case "get_contact": return this.getContact(token, params);
      case "get_deal": return this.getDeal(token, params);
      case "get_company": return this.getCompany(token, params);
      default: return { success: false, data: {}, error: `Unknown action: ${actionName}`, strippedFields: [] };
    }
  }

  async testConnection(integration: Integration): Promise<{ ok: boolean; error?: string }> {
    if (!integration.accessToken) return { ok: false, error: "Missing access token" };
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts?limit=1`, {
        headers: { Authorization: `Bearer ${integration.accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  getOAuthConfig(): OAuthConfig | null {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      authorizationUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      clientId,
      clientSecret,
      scopes: ["crm.objects.contacts.read", "crm.objects.deals.read", "crm.objects.companies.read"],
    };
  }

  private async getContact(token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: params.email }] }],
          properties: ["firstname", "lastname", "email", "phone", "company", "lifecyclestage"],
          limit: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `HubSpot API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const results = data.results ?? [];
      if (results.length === 0) {
        return { success: true, data: { result: "Contact not found" }, strippedFields: [] };
      }

      const contact = results[0].properties;
      return {
        success: true,
        data: {
          name: `${contact.firstname ?? ""} ${contact.lastname ?? ""}`.trim() || "Unknown",
          company: contact.company ?? null,
          lifecycle_stage: contact.lifecyclestage ?? null,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }

  private async getDeal(token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      let url: string;
      if (params.deal_id) {
        url = `${HUBSPOT_API}/crm/v3/objects/deals/${params.deal_id}?properties=dealname,dealstage,amount,closedate`;
      } else if (params.deal_name) {
        const searchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            filterGroups: [{ filters: [{ propertyName: "dealname", operator: "CONTAINS_TOKEN", value: params.deal_name }] }],
            properties: ["dealname", "dealstage", "amount", "closedate"],
            limit: 1,
          }),
          signal: AbortSignal.timeout(10000),
        });
        const searchData = await searchRes.json();
        if (!searchData.results?.length) {
          return { success: true, data: { result: "Deal not found" }, strippedFields: [] };
        }
        const deal = searchData.results[0].properties;
        return {
          success: true,
          data: {
            deal_name: deal.dealname,
            stage: deal.dealstage,
            amount: deal.amount ? `$${deal.amount}` : null,
            close_date: deal.closedate,
          },
          strippedFields: [],
        };
      } else {
        return { success: false, data: {}, error: "Provide deal_name or deal_id", strippedFields: [] };
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `HubSpot API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      return {
        success: true,
        data: {
          deal_name: data.properties.dealname,
          stage: data.properties.dealstage,
          amount: data.properties.amount ? `$${data.properties.amount}` : null,
          close_date: data.properties.closedate,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }

  private async getCompany(token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: params.company_name }] }],
          properties: ["name", "domain", "industry", "city", "state", "numberofemployees"],
          limit: 1,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `HubSpot API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      if (!data.results?.length) {
        return { success: true, data: { result: "Company not found" }, strippedFields: [] };
      }

      const company = data.results[0].properties;
      return {
        success: true,
        data: {
          company_name: company.name,
          domain: company.domain ?? null,
          industry: company.industry ?? null,
          location: [company.city, company.state].filter(Boolean).join(", ") || null,
          employees: company.numberofemployees ?? null,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }
}

registerPlugin(new HubSpotPlugin());
