/**
 * WhatsApp Business API adapter.
 *
 * Uses Meta Cloud API (not BSP). Handles:
 * - Message sending (text, interactive, template)
 * - 24-hour session window tracking
 * - Media message support
 * - Phone number verification
 * - Template management
 */

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

// ---- Session window (24h rule) ----

/**
 * WhatsApp enforces a 24-hour customer service window.
 * After 24h of inactivity, only pre-approved templates can be sent.
 */
export function isWithinServiceWindow(lastCustomerMessageAt: Date | null): boolean {
  if (!lastCustomerMessageAt) return false;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return Date.now() - lastCustomerMessageAt.getTime() < twentyFourHours;
}

// ---- Message sending ----

export async function sendTextMessage(opts: {
  phoneNumberId: string;
  to: string;
  text: string;
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "text",
      text: { body: opts.text },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[WhatsApp] Send failed:", error);
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return {
    success: true,
    messageId: data.messages?.[0]?.id ?? null,
  };
}

export async function sendTemplateMessage(opts: {
  phoneNumberId: string;
  to: string;
  templateName: string;
  language: string;
  components?: unknown[];
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "template",
      template: {
        name: opts.templateName,
        language: { code: opts.language },
        components: opts.components,
      },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[WhatsApp] Template send failed:", error);
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return {
    success: true,
    messageId: data.messages?.[0]?.id ?? null,
  };
}

export async function sendImageMessage(opts: {
  phoneNumberId: string;
  to: string;
  imageUrl: string;
  caption?: string;
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: opts.to,
      type: "image",
      image: { link: opts.imageUrl, caption: opts.caption },
    }),
  });

  if (!res.ok) {
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return { success: true, messageId: data.messages?.[0]?.id ?? null };
}

// ---- Template management ----

export async function createTemplate(opts: {
  wabaId: string;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  components: unknown[];
  accessToken: string;
}): Promise<{ success: boolean; templateId: string | null; status: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.wabaId}/message_templates`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.name,
      language: opts.language,
      category: opts.category,
      components: opts.components,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[WhatsApp] Template creation failed:", error);
    return { success: false, templateId: null, status: null };
  }

  const data = await res.json();
  return {
    success: true,
    templateId: data.id ?? null,
    status: data.status ?? "PENDING",
  };
}

export async function getTemplates(opts: {
  wabaId: string;
  accessToken: string;
}): Promise<unknown[]> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.wabaId}/message_templates`, {
    headers: { "Authorization": `Bearer ${opts.accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.data ?? [];
}

// ---- Phone number verification ----

export async function requestVerificationCode(opts: {
  phoneNumberId: string;
  codeMethod: "SMS" | "VOICE";
  language: string;
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.phoneNumberId}/request_code`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code_method: opts.codeMethod,
      language: opts.language,
    }),
  });

  return res.ok;
}

export async function verifyCode(opts: {
  phoneNumberId: string;
  code: string;
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.phoneNumberId}/verify_code`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: opts.code }),
  });

  return res.ok;
}

// ---- Webhook signature verification ----

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computed = "sha256=" + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}
