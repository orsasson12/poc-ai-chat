/**
 * Webhook delivery for external escalation integrations.
 *
 * Supports: Zendesk, HubSpot, Slack, and generic webhook URLs.
 * Includes retry logic with exponential backoff.
 */

import type { EscalationContext } from "@bizassist/types";
import * as queries from "@/lib/db/queries";

// ---- Payload types ----

/** Standard webhook payload sent to any endpoint */
export interface WebhookPayload {
  event: "escalation.created";
  version: "1.0";
  escalation: {
    id: string;
    trigger: string;
    status: string;
    confidence: number | null;
    createdAt: string;
  };
  conversation: {
    id: string;
    messageCount: number;
    summary: string;
    transcript: EscalationContext["transcript"];
  };
  customer: EscalationContext["customer"];
  assistant: {
    name: string;
    businessName: string;
  };
  knowledgeSources: EscalationContext["knowledgeSources"];
  botDraftAnswer: string | null;
}

// ---- Delivery ----

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // ms

export async function deliverWebhook(opts: {
  escalationEventId: string;
  tenantId: string;
  webhookUrl: string;
  webhookSecret: string | null;
  context: EscalationContext;
}): Promise<{ success: boolean; statusCode: number | null }> {
  const payload = buildPayload(opts.context);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "BizAssist-Webhook/1.0",
      };

      // Add HMAC signature if secret is configured
      if (opts.webhookSecret) {
        const signature = await computeHmac(opts.webhookSecret, JSON.stringify(payload));
        headers["X-BizAssist-Signature"] = signature;
      }

      const res = await fetch(opts.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      await queries.updateEscalationEvent(opts.escalationEventId, opts.tenantId, {
        webhookDeliveredAt: res.ok ? new Date() : undefined,
        webhookResponseStatus: res.status,
        webhookRetries: attempt,
      });

      if (res.ok) {
        return { success: true, statusCode: res.status };
      }

      // Non-retryable status codes
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { success: false, statusCode: res.status };
      }
    } catch (err) {
      console.error(`Webhook delivery attempt ${attempt + 1} failed:`, err);
      await queries.updateEscalationEvent(opts.escalationEventId, opts.tenantId, {
        webhookRetries: attempt + 1,
      });
    }

    // Wait before retry
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  return { success: false, statusCode: null };
}

// ---- Payload builders ----

function buildPayload(ctx: EscalationContext): WebhookPayload {
  return {
    event: "escalation.created",
    version: "1.0",
    escalation: {
      id: ctx.escalationId,
      trigger: ctx.trigger,
      status: "pending",
      confidence: ctx.confidenceAtEscalation,
      createdAt: ctx.createdAt,
    },
    conversation: {
      id: ctx.conversationId,
      messageCount: ctx.transcript.length,
      summary: ctx.summary,
      transcript: ctx.transcript,
    },
    customer: ctx.customer,
    assistant: {
      name: ctx.assistantName,
      businessName: ctx.businessName,
    },
    knowledgeSources: ctx.knowledgeSources,
    botDraftAnswer: ctx.botDraftAnswer,
  };
}

// ---- Adapter helpers for popular platforms ----

/** Formats payload for Slack incoming webhook */
export function formatSlackPayload(ctx: EscalationContext): object {
  const customerLabel = ctx.customer.name ?? ctx.customer.email ?? "Anonymous";
  return {
    text: `New escalation from ${ctx.assistantName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Escalation: ${ctx.trigger.replace("_", " ")}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Customer:*\n${customerLabel}` },
          { type: "mrkdwn", text: `*Confidence:*\n${ctx.confidenceAtEscalation ? Math.round(ctx.confidenceAtEscalation * 100) + "%" : "N/A"}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Summary:*\n${ctx.summary}` },
      },
    ],
  };
}

/** Formats payload for Zendesk ticket creation */
export function formatZendeskPayload(ctx: EscalationContext): object {
  const transcript = ctx.transcript
    .map((m) => `[${m.sender}] ${m.content}`)
    .join("\n\n");

  return {
    ticket: {
      subject: `[${ctx.businessName}] Customer escalation — ${ctx.trigger.replace("_", " ")}`,
      comment: {
        body: `${ctx.summary}\n\n--- Transcript ---\n\n${transcript}`,
      },
      requester: ctx.customer.email
        ? { email: ctx.customer.email, name: ctx.customer.name ?? undefined }
        : undefined,
      tags: ["bizassist", `trigger:${ctx.trigger}`],
    },
  };
}

/** Formats payload for HubSpot engagement creation */
export function formatHubSpotPayload(ctx: EscalationContext): object {
  const transcript = ctx.transcript
    .map((m) => `[${m.sender}] ${m.content}`)
    .join("\n\n");

  return {
    properties: {
      hs_note_body: `BizAssist Escalation\n\nTrigger: ${ctx.trigger}\nSummary: ${ctx.summary}\n\nTranscript:\n${transcript}`,
      hs_timestamp: new Date(ctx.createdAt).getTime(),
    },
  };
}

// ---- HMAC signature ----

async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
