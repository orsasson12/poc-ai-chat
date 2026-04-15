/**
 * Facebook Messenger adapter.
 *
 * Handles:
 * - Message sending (text, templates, quick replies)
 * - Persistent menu configuration
 * - Get Started button / greeting text
 * - Handover protocol for human agent takeover
 * - Page subscription management
 */

const META_GRAPH_URL = "https://graph.facebook.com/v21.0";

// ---- Message sending ----

export async function sendTextMessage(opts: {
  recipientId: string;
  text: string;
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  return sendMessage(opts.accessToken, {
    recipient: { id: opts.recipientId },
    message: { text: opts.text },
  });
}

export async function sendQuickReplies(opts: {
  recipientId: string;
  text: string;
  quickReplies: { title: string; payload: string }[];
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  return sendMessage(opts.accessToken, {
    recipient: { id: opts.recipientId },
    message: {
      text: opts.text,
      quick_replies: opts.quickReplies.slice(0, 13).map((qr) => ({
        content_type: "text",
        title: qr.title.slice(0, 20),
        payload: qr.payload,
      })),
    },
  });
}

export async function sendGenericTemplate(opts: {
  recipientId: string;
  elements: {
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons?: { type: string; title: string; url?: string; payload?: string }[];
  }[];
  accessToken: string;
}): Promise<{ success: boolean; messageId: string | null }> {
  return sendMessage(opts.accessToken, {
    recipient: { id: opts.recipientId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: opts.elements.slice(0, 10),
        },
      },
    },
  });
}

async function sendMessage(
  accessToken: string,
  payload: unknown,
): Promise<{ success: boolean; messageId: string | null }> {
  const res = await fetch(`${META_GRAPH_URL}/me/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[Messenger] Send failed:", error);
    return { success: false, messageId: null };
  }

  const data = await res.json();
  return { success: true, messageId: data.message_id ?? null };
}

// ---- Page configuration ----

export async function setGetStartedButton(opts: {
  pageId: string;
  payload: string;
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.pageId}/messenger_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      get_started: { payload: opts.payload },
    }),
  });
  return res.ok;
}

export async function setGreetingText(opts: {
  pageId: string;
  greetings: { locale: string; text: string }[];
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.pageId}/messenger_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      greeting: opts.greetings,
    }),
  });
  return res.ok;
}

export async function setPersistentMenu(opts: {
  pageId: string;
  menuItems: { type: string; title: string; payload?: string; url?: string }[];
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/${opts.pageId}/messenger_profile`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persistent_menu: [
        {
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: opts.menuItems.slice(0, 5),
        },
      ],
    }),
  });
  return res.ok;
}

// ---- Handover protocol ----

export async function passThreadControl(opts: {
  recipientId: string;
  targetAppId: string;
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/me/pass_thread_control`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
      target_app_id: opts.targetAppId,
    }),
  });
  return res.ok;
}

export async function takeThreadControl(opts: {
  recipientId: string;
  accessToken: string;
}): Promise<boolean> {
  const res = await fetch(`${META_GRAPH_URL}/me/take_thread_control`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: opts.recipientId },
    }),
  });
  return res.ok;
}

// ---- Page subscription (webhooks) ----

export async function subscribePageToWebhook(opts: {
  pageId: string;
  accessToken: string;
  fields?: string[];
}): Promise<boolean> {
  const fields = opts.fields ?? ["messages", "messaging_postbacks", "messaging_optins", "messaging_handovers"];
  const res = await fetch(`${META_GRAPH_URL}/${opts.pageId}/subscribed_apps`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subscribed_fields: fields,
    }),
  });
  return res.ok;
}
