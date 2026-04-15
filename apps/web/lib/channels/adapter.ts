/**
 * Channel adapter abstraction.
 *
 * Each channel (widget, WhatsApp, Messenger, Instagram) implements this
 * interface to normalize inbound messages and format outbound responses.
 */

import type {
  ChannelType,
  InboundMessage,
  OutboundMessage,
  CardData,
} from "@bizassist/types";

/**
 * Abstract base for all channel adapters.
 * Subclasses handle platform-specific parsing, formatting, and delivery.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;

  /** Verify webhook signature / authenticity of incoming request */
  verifyWebhook(request: Request): Promise<boolean>;

  /** Parse platform-specific payload into normalized InboundMessage(s) */
  parseInbound(body: unknown, connectionId: string, tenantId: string, assistantId: string): InboundMessage[];

  /** Format a normalized OutboundMessage for this channel's constraints */
  formatOutbound(message: OutboundMessage): FormattedResponse;

  /** Send a formatted response to the platform */
  send(formatted: FormattedResponse, recipientId: string, accessToken: string): Promise<SendResult>;
}

export interface FormattedResponse {
  /** Platform-specific payload ready to POST to the channel's API */
  payload: unknown;
  /** Fallback plain text (for logging / auditing) */
  plainText: string;
}

export interface SendResult {
  success: boolean;
  platformMessageId: string | null;
  error: string | null;
}

// ---- Rich card adaptation ----

/** WhatsApp limits: 1024 chars body, 3 buttons, 10 list rows */
const WA_BODY_LIMIT = 1024;
const WA_BUTTON_LIMIT = 3;
const WA_LIST_ROW_LIMIT = 10;

/** Messenger limits: 80 char title, 80 char subtitle, 3 buttons per card, 10 cards */
const MSG_TITLE_LIMIT = 80;
const MSG_BUTTON_LIMIT = 3;

/**
 * Converts BizAssist CardData to WhatsApp interactive message format.
 * Uses list messages for multiple items, reply buttons for single.
 */
export function cardsToWhatsApp(
  text: string,
  cards: CardData[],
): { type: "text" | "interactive"; body: unknown } {
  if (cards.length === 0) {
    return { type: "text", body: { body: truncate(text, WA_BODY_LIMIT) } };
  }

  if (cards.length === 1) {
    const card = cards[0];
    const fields = Object.entries(card.fields)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const body = `${text}\n\n*${card.title}*\n${fields}`.trim();

    const buttons = [];
    if (card.sourceUrl) {
      buttons.push({ type: "reply", reply: { id: "view_more", title: "View Details" } });
    }

    if (buttons.length > 0) {
      return {
        type: "interactive",
        body: {
          type: "button",
          body: { text: truncate(body, WA_BODY_LIMIT) },
          action: { buttons: buttons.slice(0, WA_BUTTON_LIMIT) },
        },
      };
    }
    return { type: "text", body: { body: truncate(body, WA_BODY_LIMIT) } };
  }

  // Multiple cards → list message
  const rows = cards.slice(0, WA_LIST_ROW_LIMIT).map((card) => ({
    id: card.knowledgeItemId,
    title: truncate(card.title, 24),
    description: truncate(
      Object.entries(card.fields)
        .filter(([, v]) => v !== null)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", "),
      72,
    ),
  }));

  return {
    type: "interactive",
    body: {
      type: "list",
      body: { text: truncate(text, WA_BODY_LIMIT) },
      action: {
        button: "View Options",
        sections: [{ title: "Items", rows }],
      },
    },
  };
}

/**
 * Converts BizAssist CardData to Messenger generic template format.
 */
export function cardsToMessenger(
  text: string,
  cards: CardData[],
): { type: "text" | "template"; payload: unknown } {
  if (cards.length === 0) {
    return { type: "text", payload: { text } };
  }

  const elements = cards.slice(0, 10).map((card) => {
    const subtitle = Object.entries(card.fields)
      .filter(([, v]) => v !== null)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");

    const buttons = [];
    if (card.sourceUrl) {
      buttons.push({ type: "web_url", url: card.sourceUrl, title: "View Details" });
    }

    return {
      title: truncate(card.title, MSG_TITLE_LIMIT),
      subtitle: truncate(subtitle, MSG_TITLE_LIMIT),
      image_url: card.imageUrl ?? undefined,
      buttons: buttons.slice(0, MSG_BUTTON_LIMIT),
    };
  });

  return {
    type: "template",
    payload: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements,
        },
      },
    },
  };
}

/**
 * Converts BizAssist CardData to Instagram quick replies.
 * Instagram DMs have very limited rich content — use text + quick replies.
 */
export function cardsToInstagram(
  text: string,
  cards: CardData[],
): { text: string; quickReplies: { content_type: string; title: string; payload: string }[] } {
  if (cards.length === 0) {
    return { text, quickReplies: [] };
  }

  // Build a text summary of cards
  const cardSummaries = cards.slice(0, 3).map((card, i) => {
    const fields = Object.entries(card.fields)
      .filter(([, v]) => v !== null)
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `${i + 1}. ${card.title} — ${fields}`;
  });

  const fullText = `${text}\n\n${cardSummaries.join("\n")}`;

  // Quick replies for each card (IG supports up to 13)
  const quickReplies = cards.slice(0, 4).map((card) => ({
    content_type: "text" as const,
    title: truncate(card.title, 20),
    payload: `card:${card.knowledgeItemId}`,
  }));

  return { text: fullText, quickReplies };
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}
