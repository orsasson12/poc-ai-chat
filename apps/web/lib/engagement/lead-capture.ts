/**
 * Progressive lead capture logic.
 *
 * Works within the chat conversation to naturally collect lead information.
 * The bot asks qualifying questions based on page context, collects contact
 * info progressively, and scores lead intent.
 */

import type { LeadIntent, EngagementTrigger } from "@bizassist/types";
import * as queries from "@/lib/db/queries";

// ---- Intent scoring ----

interface IntentSignals {
  /** Which page the visitor was on when captured */
  pageUrl: string;
  /** Which trigger fired */
  trigger: EngagementTrigger;
  /** Number of pages viewed in this session */
  pageViews: number;
  /** Whether the visitor is returning */
  isReturnVisitor: boolean;
  /** Whether they provided an email voluntarily */
  emailProvided: boolean;
  /** Whether they provided a phone number */
  phoneProvided: boolean;
  /** How many qualifying questions they answered */
  questionsAnswered: number;
  /** Time spent on site in seconds */
  timeOnSite: number;
}

export function scoreLeadIntent(signals: IntentSignals): LeadIntent {
  let score = 0;

  // Page-based signals
  if (isPricingPage(signals.pageUrl)) score += 30;
  else if (isProductPage(signals.pageUrl)) score += 20;
  else if (isContactPage(signals.pageUrl)) score += 25;

  // Behavior signals
  if (signals.isReturnVisitor) score += 15;
  if (signals.pageViews >= 3) score += 10;
  if (signals.timeOnSite > 120) score += 10;

  // Engagement signals
  if (signals.emailProvided) score += 20;
  if (signals.phoneProvided) score += 15;
  if (signals.questionsAnswered >= 2) score += 10;

  // Trigger-based signals
  if (signals.trigger === "exit_intent") score += 5; // they were about to leave
  if (signals.trigger === "return_visitor") score += 10;

  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  if (score >= 10) return "low";
  return "unknown";
}

// ---- Email / phone extraction from chat messages ----

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/;

export function extractEmail(text: string): string | null {
  const match = text.match(EMAIL_REGEX);
  return match ? match[0].toLowerCase() : null;
}

export function extractPhone(text: string): string | null {
  const match = text.match(PHONE_REGEX);
  if (!match) return null;
  const cleaned = match[0].replace(/[^\d+]/g, "");
  return cleaned.length >= 7 ? cleaned : null;
}

// ---- Lead creation / update ----

export async function getOrCreateLead(opts: {
  tenantId: string;
  assistantId: string;
  visitorId: string;
  sourceUrl: string | null;
  sourceTrigger: EngagementTrigger | null;
  engagementRuleId: string | null;
  language: string | null;
  device: string | null;
  referrer: string | null;
}) {
  // Check if this visitor already has a lead
  const existing = await queries.getLeadByVisitorId(opts.visitorId, opts.tenantId);
  if (existing) {
    await queries.updateLeadStats(existing.id, opts.tenantId, { conversation: true });
    return existing;
  }

  // Create new lead
  const lead = await queries.createLead({
    tenantId: opts.tenantId,
    assistantId: opts.assistantId,
    visitorId: opts.visitorId,
    sourceUrl: opts.sourceUrl,
    sourceTrigger: opts.sourceTrigger,
    engagementRuleId: opts.engagementRuleId,
    language: opts.language,
    device: opts.device,
    referrer: opts.referrer,
  });

  // Log the creation event
  await queries.createLeadEvent({
    tenantId: opts.tenantId,
    leadId: lead.id,
    eventType: "lead_created",
    data: {
      trigger: opts.sourceTrigger ?? "direct",
      url: opts.sourceUrl ?? "",
    },
    pageUrl: opts.sourceUrl,
  });

  // Increment rule stats
  if (opts.engagementRuleId) {
    await queries.incrementEngagementStat(opts.engagementRuleId, opts.tenantId, "lead");
  }

  return lead;
}

export async function updateLeadFromMessage(opts: {
  leadId: string;
  tenantId: string;
  messageContent: string;
  pageUrl: string | null;
}) {
  const email = extractEmail(opts.messageContent);
  const phone = extractPhone(opts.messageContent);

  const updates: Record<string, unknown> = {};

  if (email) {
    updates.email = email;
    await queries.createLeadEvent({
      tenantId: opts.tenantId,
      leadId: opts.leadId,
      eventType: "email_collected",
      data: { email },
      pageUrl: opts.pageUrl,
    });
  }

  if (phone) {
    updates.phone = phone;
    await queries.createLeadEvent({
      tenantId: opts.tenantId,
      leadId: opts.leadId,
      eventType: "phone_collected",
      data: { phone },
      pageUrl: opts.pageUrl,
    });
  }

  if (Object.keys(updates).length > 0) {
    await queries.updateLead(opts.leadId, opts.tenantId, updates as Parameters<typeof queries.updateLead>[2]);
  }

  // Track message event
  await queries.updateLeadStats(opts.leadId, opts.tenantId, { message: true });
}

// ---- Page classification helpers ----

function isPricingPage(url: string): boolean {
  return /\/(pricing|plans|packages|cost)/i.test(url);
}

function isProductPage(url: string): boolean {
  return /\/(product|service|feature|solution)/i.test(url);
}

function isContactPage(url: string): boolean {
  return /\/(contact|demo|trial|signup|register)/i.test(url);
}

// ---- Qualifying question templates ----

export function getQualifyingQuestions(pageUrl: string): string[] {
  if (isPricingPage(pageUrl)) {
    return [
      "What features are most important for your business?",
      "How many team members would be using this?",
    ];
  }
  if (isProductPage(pageUrl)) {
    return [
      "What problem are you looking to solve?",
      "Have you tried similar solutions before?",
    ];
  }
  if (isContactPage(pageUrl)) {
    return [
      "What's the best way to reach you?",
    ];
  }
  // Default questions
  return [
    "What brings you to our site today?",
    "How can I help you find what you're looking for?",
  ];
}
