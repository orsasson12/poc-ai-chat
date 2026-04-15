import { IntegrationPlugin, registerPlugin } from "../plugin";
import type { OAuthConfig } from "../plugin";
import type { Integration, IntegrationActionDef, IntegrationActionResult } from "@bizassist/types";
import { env } from "@/lib/env";

class ShopifyPlugin extends IntegrationPlugin {
  readonly provider = "shopify" as const;
  readonly displayName = "Shopify";
  readonly description = "Look up orders, products, and inventory from your Shopify store";

  getActions(): IntegrationActionDef[] {
    return [
      {
        name: "get_order",
        description: "Look up an order by order number or email. Use when a customer asks about their order status, shipping, or delivery.",
        provider: "shopify",
        parameters: [
          { name: "order_number", type: "string", description: "The order number (e.g., #1234)", required: false },
          { name: "email", type: "string", description: "Customer email to find their orders", required: false },
        ],
      },
      {
        name: "check_inventory",
        description: "Check if a product is in stock and available. Use when a customer asks about product availability.",
        provider: "shopify",
        parameters: [
          { name: "product_name", type: "string", description: "Name or partial name of the product", required: true },
        ],
      },
      {
        name: "get_product",
        description: "Get product details including price, description, and variants. Use when a customer asks about a specific product.",
        provider: "shopify",
        parameters: [
          { name: "product_name", type: "string", description: "Name or partial name of the product", required: true },
        ],
      },
    ];
  }

  async execute(
    actionName: string,
    params: Record<string, string>,
    integration: Integration,
  ): Promise<IntegrationActionResult> {
    const shopDomain = integration.shopDomain;
    const token = integration.accessToken;
    if (!shopDomain || !token) {
      return { success: false, data: {}, error: "Shopify not configured", strippedFields: [] };
    }

    const baseUrl = `https://${shopDomain}/admin/api/2024-01`;

    switch (actionName) {
      case "get_order": return this.getOrder(baseUrl, token, params);
      case "check_inventory": return this.checkInventory(baseUrl, token, params);
      case "get_product": return this.getProduct(baseUrl, token, params);
      default: return { success: false, data: {}, error: `Unknown action: ${actionName}`, strippedFields: [] };
    }
  }

  async testConnection(integration: Integration): Promise<{ ok: boolean; error?: string }> {
    if (!integration.shopDomain || !integration.accessToken) {
      return { ok: false, error: "Missing shop domain or access token" };
    }
    try {
      const res = await fetch(`https://${integration.shopDomain}/admin/api/2024-01/shop.json`, {
        headers: { "X-Shopify-Access-Token": integration.accessToken },
        signal: AbortSignal.timeout(5000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
    }
  }

  getOAuthConfig(): OAuthConfig | null {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    return {
      authorizationUrl: "https://{shop}/admin/oauth/authorize",
      tokenUrl: "https://{shop}/admin/oauth/access_token",
      clientId,
      clientSecret,
      scopes: ["read_orders", "read_products", "read_inventory"],
    };
  }

  // ---- Actions ----

  private async getOrder(baseUrl: string, token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      let url: string;
      if (params.order_number) {
        const num = params.order_number.replace("#", "");
        url = `${baseUrl}/orders.json?name=${encodeURIComponent(num)}&status=any&limit=1`;
      } else if (params.email) {
        url = `${baseUrl}/orders.json?email=${encodeURIComponent(params.email)}&status=any&limit=3`;
      } else {
        return { success: false, data: {}, error: "Provide order_number or email", strippedFields: [] };
      }

      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": token },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `Shopify API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const orders = data.orders ?? [];
      if (orders.length === 0) {
        return { success: true, data: { result: "No orders found" }, error: null, strippedFields: [] };
      }

      const order = orders[0];
      return {
        success: true,
        data: {
          order_number: `#${order.order_number}`,
          status: order.financial_status,
          fulfillment_status: order.fulfillment_status ?? "Unfulfilled",
          total_price: `${order.currency} ${order.total_price}`,
          created_at: order.created_at,
          item_count: order.line_items?.length ?? 0,
          tracking_url: order.fulfillments?.[0]?.tracking_url ?? null,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }

  private async checkInventory(baseUrl: string, token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const res = await fetch(`${baseUrl}/products.json?title=${encodeURIComponent(params.product_name)}&limit=3`, {
        headers: { "X-Shopify-Access-Token": token },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `Shopify API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const products = data.products ?? [];
      if (products.length === 0) {
        return { success: true, data: { result: "Product not found" }, error: null, strippedFields: [] };
      }

      const product = products[0];
      const variants = product.variants ?? [];
      const totalInventory = variants.reduce((sum: number, v: { inventory_quantity: number }) => sum + (v.inventory_quantity ?? 0), 0);

      return {
        success: true,
        data: {
          product_name: product.title,
          in_stock: totalInventory > 0,
          total_inventory: totalInventory,
          variants_available: variants.filter((v: { inventory_quantity: number }) => v.inventory_quantity > 0).length,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }

  private async getProduct(baseUrl: string, token: string, params: Record<string, string>): Promise<IntegrationActionResult> {
    try {
      const res = await fetch(`${baseUrl}/products.json?title=${encodeURIComponent(params.product_name)}&limit=1`, {
        headers: { "X-Shopify-Access-Token": token },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { success: false, data: {}, error: `Shopify API: ${res.status}`, strippedFields: [] };

      const data = await res.json();
      const products = data.products ?? [];
      if (products.length === 0) {
        return { success: true, data: { result: "Product not found" }, error: null, strippedFields: [] };
      }

      const product = products[0];
      return {
        success: true,
        data: {
          product_name: product.title,
          description: (product.body_html ?? "").replace(/<[^>]*>/g, "").slice(0, 300),
          price: product.variants?.[0]?.price ?? "N/A",
          currency: product.variants?.[0]?.currency ?? "USD",
          available: product.status === "active",
          product_url: `https://${new URL(baseUrl).hostname.replace("/admin/api/2024-01", "")}//products/${product.handle}`,
        },
        strippedFields: [],
      };
    } catch (err) {
      return { success: false, data: {}, error: err instanceof Error ? err.message : "Request failed", strippedFields: [] };
    }
  }
}

registerPlugin(new ShopifyPlugin());
