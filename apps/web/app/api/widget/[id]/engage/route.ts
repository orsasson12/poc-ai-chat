import { NextRequest } from "next/server";
import { z } from "zod";
import { hasDatabase } from "@/lib/env";
import * as queries from "@/lib/db/queries";
import { evaluateEngagementRules } from "@/lib/engagement/evaluate";
import type { EngagementRule, WidgetBehaviorSignals } from "@bizassist/types";

const signalsSchema = z.object({
  pageUrl: z.string(),
  pageTitle: z.string(),
  referrer: z.string(),
  timeOnPageSeconds: z.number(),
  scrollDepthPercent: z.number(),
  isExitIntent: z.boolean(),
  isReturnVisitor: z.boolean(),
  visitorId: z.string(),
  device: z.enum(["desktop", "mobile", "tablet"]),
  language: z.string(),
  /** Rule IDs the widget currently suppresses (session cap or cool-down active). */
  suppressedRuleIds: z.array(z.string()).optional(),
});

/**
 * POST — Evaluate engagement rules against visitor signals.
 * Called by the widget script to decide if a proactive message should show.
 * Public endpoint (no auth) — scoped by assistant ID.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: assistantId } = await params;

  const body = await request.json();
  const parsed = signalsSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ engage: false });
  }

  const { suppressedRuleIds, ...signalsOnly } = parsed.data;
  const signals = signalsOnly as WidgetBehaviorSignals;

  if (!hasDatabase()) {
    // Mock mode: engage after 15s on page
    if (signals.timeOnPageSeconds >= 15) {
      return Response.json({
        engage: true,
        message: "Hi! I noticed you're browsing our site. Can I help you find what you're looking for?",
        ruleId: "mock_rule",
      });
    }
    return Response.json({ engage: false });
  }

  // Look up assistant and its engagement rules
  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant || !assistant.isActive) {
    return Response.json({ engage: false });
  }

  const rules = await queries.getEngagementRules(assistantId, assistant.tenantId);
  if (rules.length === 0) {
    return Response.json({ engage: false, noRules: true });
  }

  // Map DB rows to the type interface. Drizzle json columns may come back as
  // `null` if the DB row is pre-migration; normalise to empty arrays / null.
  const typedRules: EngagementRule[] = rules.map((r) => ({
    ...r,
    delaySeconds: r.delaySeconds ?? 15,
    scrollPercent: r.scrollPercent ?? 50,
    qualifyingQuestions: r.qualifyingQuestions ?? [],
    messageButtons: r.messageButtons ?? [],
    messageCta: r.messageCta ?? null,
    messageImage: r.messageImage ?? null,
    maxPerSession: r.maxPerSession ?? 0,
    maxPerVisitor: r.maxPerVisitor ?? 0,
    cooldownSeconds: r.cooldownSeconds ?? 0,
    confidenceThreshold: 0, // not used for engagement
    consecutiveCount: 0,    // not used for engagement
    phrases: null,          // not used for engagement
  }));

  // Lifetime cap enforcement: look up how many times each rule has fired for
  // this visitor (via the trigger_fired lead_events audit trail). Anonymous
  // visitors (no lead yet) get an empty map and therefore no cap.
  let visitorFireCounts: Record<string, number> = {};
  if (signals.visitorId) {
    try {
      visitorFireCounts = await queries.getVisitorRuleFireCounts(
        assistant.tenantId,
        signals.visitorId,
      );
    } catch (err) {
      console.error("getVisitorRuleFireCounts failed:", err);
    }
  }

  const result = evaluateEngagementRules(typedRules, signals, {
    suppressedRuleIds,
    visitorFireCounts,
  });

  return Response.json(result, {
    headers: {
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * PATCH — Track engagement events (impressions, leads, page views).
 * Called by the widget script after showing a proactive message or capturing a lead.
 */
const eventSchema = z.object({
  ruleId: z.string().optional(),
  event: z.enum(["impression", "engagement", "lead", "page_view", "dismiss"]),
  visitorId: z.string(),
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: assistantId } = await params;

  const body = await request.json();
  const parsed = eventSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ success: false });
  }

  if (!hasDatabase()) {
    return Response.json({ success: true });
  }

  const { ruleId, event, visitorId, pageUrl } = parsed.data;

  const assistant = await queries.getAssistantById(assistantId);
  if (!assistant) {
    return Response.json({ success: false });
  }

  const tenantId = assistant.tenantId;

  // Update rule stats
  if (ruleId && ruleId !== "mock_rule") {
    await queries.incrementEngagementStat(ruleId, tenantId, event);
  }

  // Lead-event audit trail. We only write if the visitor already has a lead
  // record — anonymous fires are captured by the rule's own impression counter.
  if (visitorId) {
    const lead = await queries.getLeadByVisitorId(visitorId, tenantId);
    if (lead) {
      if (event === "page_view" && pageUrl) {
        await queries.createLeadEvent({
          tenantId,
          leadId: lead.id,
          eventType: "page_view",
          data: { url: pageUrl },
          pageUrl,
        });
        await queries.updateLeadStats(lead.id, tenantId, { pageView: true });
      } else if (event === "impression" && ruleId && ruleId !== "mock_rule") {
        // The proactive message from an engagement rule actually showed on
        // screen — GDPR-safe audit trail of which rule fired for this visitor.
        await queries.createLeadEvent({
          tenantId,
          leadId: lead.id,
          eventType: "trigger_fired",
          data: { ruleId, url: pageUrl ?? null },
          pageUrl: pageUrl ?? null,
        });
      } else if (event === "dismiss" && ruleId && ruleId !== "mock_rule") {
        await queries.createLeadEvent({
          tenantId,
          leadId: lead.id,
          eventType: "dismissed",
          data: { ruleId, url: pageUrl ?? null },
          pageUrl: pageUrl ?? null,
        });
      }
    }
  }

  return Response.json({ success: true }, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

/** CORS preflight for widget requests */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
