/**
 * Instagram DM adapter.
 *
 * Shares the Meta Graph API with Messenger but has specific limitations:
 * - Requires Instagram Professional (Business or Creator) account
 * - Connected to a Facebook Page
 * - No templates — only text + quick replies
 * - Story mention handling
 * - Ice breaker questions
 * - 24-hour messaging window (like WhatsApp)
 */

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

// ---- Message sending ----

export async function sendTextMessage(opts: {
  recipientId: string;
  text: string;
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/me/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: { text: opts.text },
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[Instagram] Send failed:", error);
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return { success: true, messageId: data.message_id ?? null };
}

export async function sendQuickReplies(opts: {
  recipientId: string;
  text: string;
  quickReplies: { title: string; payload: string }[];
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/me/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: {
        text: opts.text,
        quick_replies: opts.quickReplies.slice(0, 13).map((qr) => ({
          content_type: "text",
          title: qr.title.slice(0, 20),
          payload: qr.payload,
        })),
      },
    }),
  });

  if (!res.ok) {
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return { success: true, messageId: data.message_id ?? null };
}

// ---- Ice breakers (shown when user first opens DM) ----

export async function setIceBreakers(opts: {
  pageId: string;
  iceBreakers: { question: string; payload: string }[];
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.pageId}/messenger_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ice_breakers: opts.iceBreakers.slice(0, 4).map((ib) => ({
        question: ib.question,
        payload: ib.payload,
      })),
    }),
  });
  return res.ok;
}

// ---- Story mention handling ----

/**
 * Checks if a webhook event is a story mention.
 * When a user mentions the business in their IG story, we can auto-reply.
 */
export function isStoryMention(event: Record<string, unknown>): boolean {
  const message = event.message as Record<string, unknown> | undefined;
  if (!message?.attachments) return false;

  const attachments = message.attachments as { type: string; payload?: { url?: string } }[];
  return attachments.some((a) => a.type === "story_mention");
}

/**
 * Extracts the story URL from a story mention event.
 */
export function getStoryMentionUrl(event: Record<string, unknown>): string | null {
  const message = event.message as Record<string, unknown> | undefined;
  if (!message?.attachments) return null;

  const attachments = message.attachments as { type: string; payload?: { url?: string } }[];
  const mention = attachments.find((a) => a.type === "story_mention");
  return mention?.payload?.url ?? null;
}

// ---- Media message handling ----

export async function sendImageMessage(opts: {
  recipientId: string;
  imageUrl: string;
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/me/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      message: {
        attachment: {
          type: "image",
          payload: { url: opts.imageUrl, is_reusable: true },
        },
      },
    }),
  });

  if (!res.ok) {
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return { success: true, messageId: data.message_id ?? null };
}

// ---- 24-hour window check (same logic as WhatsApp) ----

export function isWithinMessageWindow(lastCustomerMessageAt: Date | null): boolean {
  if (!lastCustomerMessageAt) return false;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return Date.now() - lastCustomerMessageAt.getTime() < twentyFourHours;
}
