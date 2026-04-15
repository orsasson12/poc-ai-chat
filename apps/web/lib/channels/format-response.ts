/**
 * Response formatter — adapts bot output to each channel's constraints.
 *
 * Takes a bot response (text + optional cards/sources) and returns a
 * channel-appropriate message format.
 */

import type { ChannelType, CardData, OutboundMessage } from "@bizassist/types";
import {
  cardsToWhatsApp,
  cardsToMessenger,
  cardsToInstagram,
} from "./adapter";

/**
 * Strips [CARD:xxx] markers from bot text and extracts card IDs.
 */
export function extractCardMarkers(text: string): { cleanText: string; cardIds: string[] } {
  const cardIds: string[] = [];
  const cleanText = text.replace(/\[CARD:([^\]]+)\]/g, (_, id) => {
    cardIds.push(id);
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();

  return { cleanText, cardIds };
}

/**
 * Formats a bot response for a specific channel.
 * Handles text limits, card translation, and channel-specific quirks.
 */
export function formatForChannel(
  channel: ChannelType,
  text: string,
  cards: CardData[],
  sources: { title: string; url: string }[],
): OutboundMessage {
  const { cleanText, cardIds } = extractCardMarkers(text);

  // Filter cards to only those referenced in the text
  const referencedCards = cardIds.length > 0
    ? cards.filter((c) => cardIds.includes(c.knowledgeItemId))
    : [];

  return {
    text: cleanText,
    cards: referencedCards,
    quickReplies: [],
    media: null,
    sources,
  };
}

/**
 * Builds the platform-specific payload for sending.
 */
export function buildChannelPayload(
  channel: ChannelType,
  outbound: OutboundMessage,
  recipientId: string,
): unknown {
  switch (channel) {
    case "whatsapp": {
      const wa = cardsToWhatsApp(outbound.text, outbound.cards);
      if (wa.type === "text") {
        // Append sources as plain text links
        let text = (wa.body as { body: string }).body;
        if (outbound.sources.length > 0) {
          text += "\n\n" + outbound.sources.map((s) => `${s.title}: ${s.url}`).join("\n");
        }
        return {
          messaging_product: "whatsapp",
          to: recipientId,
          type: "text",
          text: { body: text },
        };
      }
      return {
        messaging_product: "whatsapp",
        to: recipientId,
        type: "interactive",
        interactive: wa.body,
      };
    }

    case "messenger": {
      const fb = cardsToMessenger(outbound.text, outbound.cards);
      if (fb.type === "text") {
        let text = (fb.payload as { text: string }).text;
        if (outbound.sources.length > 0) {
          text += "\n\n" + outbound.sources.map((s) => `${s.title}: ${s.url}`).join("\n");
        }
        return {
          recipient: { id: recipientId },
          message: { text },
        };
      }
      // Send text first, then template
      return {
        recipient: { id: recipientId },
        message: fb.payload,
      };
    }

    case "instagram": {
      const ig = cardsToInstagram(outbound.text, outbound.cards);
      const message: Record<string, unknown> = { text: ig.text };
      if (ig.quickReplies.length > 0) {
        message.quick_replies = ig.quickReplies;
      }
      return {
        recipient: { id: recipientId },
        message,
      };
    }

    case "widget":
    default:
      // Widget uses SSE streaming — this is not used directly
      return { text: outbound.text, cards: outbound.cards, sources: outbound.sources };
  }
}
