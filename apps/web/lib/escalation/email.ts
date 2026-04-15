/**
 * Sends escalation notification emails.
 *
 * Uses a simple fetch-based approach. In production, this would integrate
 * with Resend, SendGrid, or Supabase Edge Functions for email delivery.
 * For now, it logs the email payload and resolves — the actual transport
 * is pluggable.
 */

import type { EscalationContext } from "@bizassist/types";

interface SendEscalationEmailOpts {
  to: string;
  context: EscalationContext;
}

export async function sendEscalationEmail(opts: SendEscalationEmailOpts): Promise<void> {
  const { to, context } = opts;

  const subject = `[${context.businessName}] Customer needs help — ${triggerLabel(context.trigger)}`;
  const html = buildEmailHtml(context);

  // TODO: Replace with actual email provider (Resend, SendGrid, etc.)
  // For now, log the email payload for development
  console.log("[Escalation Email]", {
    to,
    subject,
    escalationId: context.escalationId,
    trigger: context.trigger,
    conversationId: context.conversationId,
  });

  // When an email provider is configured, uncomment:
  // await fetch("https://api.resend.com/emails", {
  //   method: "POST",
  //   headers: {
  //     "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     from: `${context.businessName} <noreply@bizassist.ai>`,
  //     to: [to],
  //     subject,
  //     html,
  //   }),
  // });
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case "explicit_request": return "Customer requested human agent";
    case "low_confidence": return "Low confidence responses";
    case "repeat_failure": return "Repeated fallback responses";
    case "safety": return "Safety event detected";
    case "sentiment": return "Negative sentiment detected";
    default: return "Escalation";
  }
}

function buildEmailHtml(ctx: EscalationContext): string {
  const transcriptHtml = ctx.transcript
    .map((msg) => {
      const sender = msg.sender === "customer" ? "Customer" : msg.sender === "agent" ? "Agent" : "Bot";
      const confLabel = msg.confidence !== null ? ` (${Math.round(msg.confidence * 100)}% confidence)` : "";
      return `<p><strong>${sender}${confLabel}:</strong> ${escapeHtml(msg.content)}</p>`;
    })
    .join("");

  const sourcesHtml = ctx.knowledgeSources.length > 0
    ? `<h3>Knowledge Sources Referenced</h3><ul>${ctx.knowledgeSources.map((s) => `<li>${escapeHtml(s.title)} (${s.type})</li>`).join("")}</ul>`
    : "";

  const customerInfo = [
    ctx.customer.email && `Email: ${ctx.customer.email}`,
    ctx.customer.name && `Name: ${ctx.customer.name}`,
    ctx.customer.language && `Language: ${ctx.customer.language}`,
    ctx.customer.device && `Device: ${ctx.customer.device}`,
    ctx.customer.referrerUrl && `Came from: ${ctx.customer.referrerUrl}`,
  ].filter(Boolean);

  const customerHtml = customerInfo.length > 0
    ? `<h3>Customer Info</h3><ul>${customerInfo.map((i) => `<li>${i}</li>`).join("")}</ul>`
    : "";

  const draftHtml = ctx.botDraftAnswer
    ? `<h3>Bot's Draft Answer (not sent)</h3><blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#666">${escapeHtml(ctx.botDraftAnswer)}</blockquote>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Escalation: ${escapeHtml(ctx.assistantName)}</h2>
      <p style="color:#666;font-size:14px">Reason: ${triggerLabel(ctx.trigger)}</p>

      <h3>Summary</h3>
      <p>${escapeHtml(ctx.summary)}</p>

      ${customerHtml}

      <h3>Conversation Transcript</h3>
      <div style="background:#f9f9f9;padding:16px;border-radius:8px;font-size:14px">
        ${transcriptHtml}
      </div>

      ${draftHtml}
      ${sourcesHtml}

      <hr style="margin:24px 0;border:none;border-top:1px solid #eee" />
      <p style="font-size:12px;color:#999">
        Escalation ID: ${ctx.escalationId}<br/>
        Confidence at escalation: ${ctx.confidenceAtEscalation !== null ? Math.round(ctx.confidenceAtEscalation * 100) + "%" : "N/A"}<br/>
        Time: ${ctx.createdAt}
      </p>
    </div>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}
