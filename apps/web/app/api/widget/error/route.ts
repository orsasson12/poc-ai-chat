import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/lib/env";
import { logger } from "@/lib/observability";
import { classifyError, scrubString } from "@/lib/observability/scrub";
import * as queries from "@/lib/db/queries";

// Proxy endpoint so the widget doesn't need to bundle @sentry/browser
// (~25KB gzipped). Widget posts errors here; we scrub and forward to our
// observability stack server-side. See docs/superpowers/specs for Mission 1.
// TODO(mission-6): wrap with upstashRatelimit(assistantId, "10/m")

export const runtime = "edge";

const widgetErrorSchema = z.object({
  assistantId: z.string().uuid(),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  url: z.string().url().max(500),
  userAgent: z.string().max(300),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = widgetErrorSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const { assistantId, message, stack, url, userAgent, context } = parsed.data;

  let tenantId: string | null = null;
  if (hasDatabase()) {
    try {
      const assistant = await queries.getAssistantById(assistantId);
      tenantId = assistant?.tenantId ?? null;
    } catch {
      // Ignore — we still report the error, just without tenant attribution.
    }
  }

  const scrubbedMessage = scrubString(message);
  const scrubbedStack = stack ? scrubString(stack) : undefined;
  const scrubbedUrl = scrubString(url);
  const widgetErr = new Error(scrubbedMessage);
  if (scrubbedStack) widgetErr.stack = scrubbedStack;

  logger.error(widgetErr, {
    source: "widget",
    tenantId,
    assistantId,
    url: scrubbedUrl,
    ua: userAgent.slice(0, 200),
    context: context ?? {},
  });

  logger.event("widget.error.received", {
    assistantId,
    tenantId,
    url: scrubbedUrl,
    errKind: classifyError(widgetErr),
    ua: userAgent.slice(0, 200),
  });

  return new Response(null, { status: 204 });
}
