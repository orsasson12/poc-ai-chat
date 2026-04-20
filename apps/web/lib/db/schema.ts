import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  json,
} from "drizzle-orm/pg-core";
import type { StructuredMetadata, MessageCta, MessageButton } from "@bizassist/types";
import { relations } from "drizzle-orm";

// ---- Enums ----
export const planEnum = pgEnum("plan_type", ["starter", "professional", "business"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended", "cancelled"]);
export const knowledgeItemTypeEnum = pgEnum("knowledge_item_type", [
  "document", "url", "manual_qa", "structured",
]);
export const knowledgeItemStatusEnum = pgEnum("knowledge_item_status", [
  "pending", "processing", "active", "error", "paused",
]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "manager", "viewer"]);
export const securityEventTypeEnum = pgEnum("security_event_type", [
  "prompt_injection", "content_moderation", "pii_detected", "canary_leak", "scope_violation",
]);
export const securitySeverityEnum = pgEnum("security_severity", ["low", "medium", "high", "critical"]);
export const widgetPositionEnum = pgEnum("widget_position", ["bottom-right", "bottom-left"]);
export const launcherAnimationEnum = pgEnum("launcher_animation", [
  "none", "pulse", "bounce", "attention_flash",
]);
export const launcherIconEnum = pgEnum("launcher_icon", [
  "chat", "help", "sparkle", "bolt", "heart", "phone", "avatar",
]);
export const escalationTriggerEnum = pgEnum("escalation_trigger", [
  "low_confidence", "explicit_request", "repeat_failure", "safety", "sentiment",
]);
export const escalationModeEnum = pgEnum("escalation_mode", [
  "email", "native", "webhook",
]);
export const escalationStatusEnum = pgEnum("escalation_status", [
  "pending", "assigned", "active", "resolved", "expired",
]);
export const messageSenderEnum = pgEnum("message_sender", ["customer", "bot", "agent"]);
export const engagementTriggerEnum = pgEnum("engagement_trigger", [
  "time_on_page", "scroll_depth", "exit_intent", "return_visitor", "url_pattern",
]);
export const leadIntentEnum = pgEnum("lead_intent", ["high", "medium", "low", "unknown"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "qualified", "converted", "lost"]);
export const channelTypeEnum = pgEnum("channel_type", [
  "widget", "whatsapp", "messenger", "instagram",
]);
export const channelConnectionStatusEnum = pgEnum("channel_connection_status", [
  "pending", "active", "error", "disconnected",
]);
export const integrationProviderEnum = pgEnum("integration_provider", [
  "shopify", "hubspot", "zendesk", "generic_webhook",
]);
export const integrationStatusEnum = pgEnum("integration_status", [
  "connected", "disconnected", "error", "expired",
]);
export const refreshScheduleEnum = pgEnum("refresh_schedule", [
  "manual", "daily", "weekly", "monthly",
]);
export const changeSeverityEnum = pgEnum("change_severity", [
  "none", "minor", "major",
]);
export const changeApprovalEnum = pgEnum("change_approval", [
  "pending", "approved", "rejected", "auto_approved",
]);
export const suggestedQuestionsModeEnum = pgEnum("suggested_questions_mode", [
  "manual", "auto",
]);

// ---- Tables ----
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  plan: planEnum("plan").default("starter").notNull(),
  status: tenantStatusEnum("status").default("active").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
  costPerTicketCents: integer("cost_per_ticket_cents").default(500).notNull(),
  // ---- Compliance / residency ----
  // data_region: "eu" pins the tenant to an EU-region deployment. "us" pins to US.
  // "auto" defers to the deployment's default region. Enforcement lives in lib/region.ts.
  dataRegion: varchar("data_region", { length: 8 }).default("auto").notNull(),
  // Retention (0 = keep forever). Applied by /api/compliance/retention/run.
  retentionDaysConversations: integer("retention_days_conversations").default(365).notNull(),
  retentionDaysLeads: integer("retention_days_leads").default(730).notNull(),
  retentionDaysSecurityEvents: integer("retention_days_security_events").default(180).notNull(),
  // AI Act Limited-Risk transparency obligation.
  aiDisclosureMode: varchar("ai_disclosure_mode", { length: 16 }).default("banner").notNull(), // banner | inline | off
  aiDisclosureText: text("ai_disclosure_text"),
  // DPA acceptance audit trail. Populated when the owner accepts a DPA version in-dashboard.
  dpaAcceptedAt: timestamp("dpa_accepted_at", { withTimezone: true }),
  dpaAcceptedVersion: varchar("dpa_accepted_version", { length: 32 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const assistants = pgTable(
  "assistants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    greeting: text("greeting").notNull().default("Hi! How can I help you today?"),
    tone: varchar("tone", { length: 64 }).notNull().default("professional"),
    fallbackMsg: text("fallback_msg").notNull().default(
      "I don't have specific information about that. Please contact us directly for help."
    ),
    escalationEmail: varchar("escalation_email", { length: 256 }),
    escalationWebhook: text("escalation_webhook"),
    avatarUrl: text("avatar_url"),
    widgetColor: varchar("widget_color", { length: 7 }).notNull().default("#2563eb"),
    widgetPosition: widgetPositionEnum("widget_position").default("bottom-right").notNull(),
    launcherAnimation: launcherAnimationEnum("launcher_animation").default("none").notNull(),
    launcherAccentColor: varchar("launcher_accent_color", { length: 7 }),
    launcherAnimationIntervalSec: integer("launcher_animation_interval_sec").default(8).notNull(),
    launcherIcon: launcherIconEnum("launcher_icon").default("chat").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    confidenceThreshold: numeric("confidence_threshold", { precision: 3, scale: 2 })
      .default("0.65")
      .notNull(),
    welcomeBanner: text("welcome_banner"),
    welcomeButtons: json("welcome_buttons").$type<import("@bizassist/types").WelcomeButton[]>().default([]),
    // When true, the widget uses sessionStorage-only and skips any persistent storage so
    // the embedding site doesn't need prior cookie consent for the chatbot to function.
    cookielessMode: boolean("cookieless_mode").default(false).notNull(),
    // Launcher-bubble question chips. "auto" = derived from conversation history
    // on each widget-config fetch. "manual" = use suggestedQuestions verbatim.
    suggestedQuestionsMode: suggestedQuestionsModeEnum("suggested_questions_mode")
      .default("auto")
      .notNull(),
    suggestedQuestions: text("suggested_questions").array().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("assistants_tenant_id_idx").on(table.tenantId)]
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    type: knowledgeItemTypeEnum("type").notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    content: text("content"),
    sourceUrl: text("source_url"),
    filePath: text("file_path"),
    fileSize: integer("file_size"),
    status: knowledgeItemStatusEnum("status").default("pending").notNull(),
    chunkCount: integer("chunk_count").default(0).notNull(),
    errorMsg: text("error_msg"),
    metadata: json("metadata").$type<StructuredMetadata | null>().default(null),
    featured: boolean("featured").default(false).notNull(),
    // Refresh tracking
    refreshSchedule: refreshScheduleEnum("refresh_schedule").default("manual").notNull(),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    nextRefreshAt: timestamp("next_refresh_at", { withTimezone: true }),
    refreshStatus: varchar("refresh_status", { length: 32 }), // "ok" | "pending" | "refreshing" | "error" | "source_unavailable"
    lastRefreshError: text("last_refresh_error"),
    contentHash: varchar("content_hash", { length: 64 }),  // SHA-256 for quick change detection
    versionCount: integer("version_count").default(1).notNull(),
    pendingChangeId: uuid("pending_change_id"),  // points to knowledge_change_log if awaiting approval
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_items_tenant_id_idx").on(table.tenantId),
    index("knowledge_items_assistant_id_idx").on(table.assistantId),
    index("knowledge_items_next_refresh_idx").on(table.nextRefreshAt),
  ]
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeItemId: uuid("knowledge_item_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    pineconeId: varchar("pinecone_id", { length: 256 }).notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    heading: text("heading"),
  },
  (table) => [index("chunks_knowledge_item_id_idx").on(table.knowledgeItemId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    sessionId: varchar("session_id", { length: 128 }).notNull(),
    channel: channelTypeEnum("channel").default("widget").notNull(),
    contactId: uuid("contact_id"),
    channelConversationId: varchar("channel_conversation_id", { length: 256 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    messageCount: integer("message_count").default(0).notNull(),
    escalated: boolean("escalated").default(false).notNull(),
    escalationStatus: escalationStatusEnum("escalation_status"),
    assignedAgentId: uuid("assigned_agent_id"),
    customerEmail: varchar("customer_email", { length: 256 }),
    customerName: varchar("customer_name", { length: 256 }),
    customerLanguage: varchar("customer_language", { length: 10 }),
    customerDevice: varchar("customer_device", { length: 64 }),
    referrerUrl: text("referrer_url"),
    leadId: uuid("lead_id"),
    engagementRuleId: uuid("engagement_rule_id"),
    satisfaction: integer("satisfaction").default(0).notNull(),
  },
  (table) => [
    index("conversations_tenant_id_idx").on(table.tenantId),
    index("conversations_assistant_id_idx").on(table.assistantId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    sender: messageSenderEnum("sender").default("bot").notNull(),
    agentId: uuid("agent_id"),
    content: text("content").notNull(),
    chunksUsed: uuid("chunks_used").array(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    latencyMs: integer("latency_ms"),
    tokensUsed: integer("tokens_used"),
    isFallback: boolean("is_fallback").default(false).notNull(),
    feedback: varchar("feedback", { length: 16 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)]
);

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    eventType: securityEventTypeEnum("event_type").notNull(),
    severity: securitySeverityEnum("severity").notNull(),
    inputText: varchar("input_text", { length: 500 }).notNull(),
    classificationScore: numeric("classification_score", { precision: 4, scale: 3 }).notNull(),
    blocked: boolean("blocked").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("security_events_tenant_id_idx").on(table.tenantId)]
);

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    role: memberRoleEnum("role").default("viewer").notNull(),
    invitedBy: uuid("invited_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (table) => [index("tenant_members_tenant_id_idx").on(table.tenantId)]
);

export const usageLogs = pgTable(
  "usage_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    conversations: integer("conversations").default(0).notNull(),
    tokensIn: integer("tokens_in").default(0).notNull(),
    tokensOut: integer("tokens_out").default(0).notNull(),
  },
  (table) => [index("usage_logs_tenant_id_period_idx").on(table.tenantId, table.periodStart)]
);

// ---- Escalation Rules (configurable per assistant) ----
export const escalationRules = pgTable(
  "escalation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    trigger: escalationTriggerEnum("trigger").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    // Trigger-specific config
    confidenceThreshold: numeric("confidence_threshold", { precision: 3, scale: 2 }).default("0.40"),
    consecutiveCount: integer("consecutive_count").default(2),
    phrases: text("phrases").array(), // for explicit_request trigger
    // How to escalate
    mode: escalationModeEnum("mode").default("email").notNull(),
    webhookUrl: text("webhook_url"),
    webhookSecret: varchar("webhook_secret", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("escalation_rules_assistant_id_idx").on(table.assistantId),
  ]
);

// ---- Escalation Events ----
export const escalationEvents = pgTable(
  "escalation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    trigger: escalationTriggerEnum("trigger").notNull(),
    mode: escalationModeEnum("mode").notNull(),
    status: escalationStatusEnum("status").default("pending").notNull(),
    assignedAgentId: uuid("assigned_agent_id"),
    // Context package
    summary: text("summary"),
    botDraftAnswer: text("bot_draft_answer"),
    knowledgeSourceIds: uuid("knowledge_source_ids").array(),
    confidenceAtEscalation: numeric("confidence_at_escalation", { precision: 4, scale: 3 }),
    // Customer info snapshot
    customerEmail: varchar("customer_email", { length: 256 }),
    customerName: varchar("customer_name", { length: 256 }),
    // Webhook delivery
    webhookDeliveredAt: timestamp("webhook_delivered_at", { withTimezone: true }),
    webhookResponseStatus: integer("webhook_response_status"),
    webhookRetries: integer("webhook_retries").default(0).notNull(),
    // Email delivery
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailTo: varchar("email_to", { length: 256 }),
    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
  },
  (table) => [
    index("escalation_events_tenant_id_idx").on(table.tenantId),
    index("escalation_events_conversation_id_idx").on(table.conversationId),
    index("escalation_events_status_idx").on(table.status),
  ]
);

// ---- Agent Availability ----
export const agentAvailability = pgTable(
  "agent_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    isOnline: boolean("is_online").default(false).notNull(),
    maxConcurrent: integer("max_concurrent").default(3).notNull(),
    activeCount: integer("active_count").default(0).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("agent_availability_tenant_id_idx").on(table.tenantId),
  ]
);

// ---- Business Hours ----
export const businessHours = pgTable(
  "business_hours",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    // 0=Sunday, 6=Saturday. Each day has open/close times or null (closed).
    schedule: json("schedule").$type<DaySchedule[]>().default([
      { day: 0, open: null, close: null },
      { day: 1, open: "09:00", close: "17:00" },
      { day: 2, open: "09:00", close: "17:00" },
      { day: 3, open: "09:00", close: "17:00" },
      { day: 4, open: "09:00", close: "17:00" },
      { day: 5, open: "09:00", close: "17:00" },
      { day: 6, open: null, close: null },
    ]).notNull(),
    outsideHoursMsg: text("outside_hours_msg").default(
      "We're currently outside business hours. Leave your email and we'll get back to you."
    ).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("business_hours_assistant_id_idx").on(table.assistantId),
  ]
);

// Used by business_hours schedule column
export interface DaySchedule {
  day: number; // 0=Sunday, 6=Saturday
  open: string | null; // "HH:MM" or null (closed)
  close: string | null;
}

// ---- Engagement Rules (proactive lead capture triggers) ----
export const engagementRules = pgTable(
  "engagement_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 256 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    trigger: engagementTriggerEnum("trigger").notNull(),
    // Trigger-specific config
    delaySeconds: integer("delay_seconds").default(15),        // time_on_page
    scrollPercent: integer("scroll_percent").default(50),       // scroll_depth
    urlPattern: varchar("url_pattern", { length: 512 }),        // url_pattern (glob: /pricing/*, /products/*)
    // Message to show when trigger fires
    proactiveMessage: text("proactive_message").notNull(),
    // Optional qualifying questions (bot asks these after the proactive message)
    qualifyingQuestions: json("qualifying_questions").$type<string[]>().default([]),
    // Priority: lower = fires first when multiple rules match
    priority: integer("priority").default(100).notNull(),
    // ---- Frequency caps & cool-downs ----
    // 0 = unlimited for all three columns.
    maxPerSession: integer("max_per_session").default(0).notNull(),
    maxPerVisitor: integer("max_per_visitor").default(0).notNull(),
    cooldownSeconds: integer("cooldown_seconds").default(0).notNull(),
    // ---- Rich proactive message content ----
    messageImage: text("message_image"),                               // optional avatar / product image url
    messageCta: json("message_cta").$type<MessageCta | null>().default(null),
    messageButtons: json("message_buttons").$type<MessageButton[]>().default([]),
    // Stats
    impressions: integer("impressions").default(0).notNull(),
    engagements: integer("engagements").default(0).notNull(),
    leadsGenerated: integer("leads_generated").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("engagement_rules_assistant_id_idx").on(table.assistantId),
    index("engagement_rules_tenant_id_idx").on(table.tenantId),
  ]
);

// ---- Leads ----
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    // Visitor identity
    visitorId: varchar("visitor_id", { length: 128 }).notNull(), // persistent cookie ID
    email: varchar("email", { length: 256 }),
    phone: varchar("phone", { length: 64 }),
    name: varchar("name", { length: 256 }),
    // Qualification
    intent: leadIntentEnum("intent").default("unknown").notNull(),
    status: leadStatusEnum("status").default("new").notNull(),
    tags: text("tags").array().default([]).notNull(),
    qualificationAnswers: json("qualification_answers").$type<Record<string, string>>().default({}),
    // Source info
    sourceUrl: text("source_url"),              // page where lead was captured
    sourceTrigger: engagementTriggerEnum("source_trigger"),
    engagementRuleId: uuid("engagement_rule_id"),
    // Visitor metadata
    language: varchar("language", { length: 10 }),
    device: varchar("device", { length: 64 }),
    referrer: text("referrer"),
    // Aggregate stats
    totalPageViews: integer("total_page_views").default(0).notNull(),
    totalConversations: integer("total_conversations").default(0).notNull(),
    totalMessages: integer("total_messages").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("leads_tenant_id_idx").on(table.tenantId),
    index("leads_visitor_id_idx").on(table.visitorId),
    index("leads_intent_idx").on(table.intent),
    index("leads_email_idx").on(table.email),
  ]
);

// ---- Lead Events (timeline) ----
export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    // Event types: page_view, chat_started, message_sent, email_collected,
    //              phone_collected, qualified, trigger_fired, dismissed
    eventType: varchar("event_type", { length: 64 }).notNull(),
    // Event-specific data
    data: json("data").$type<Record<string, string | number | boolean | null>>().default({}),
    pageUrl: text("page_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("lead_events_lead_id_idx").on(table.leadId),
    index("lead_events_tenant_id_idx").on(table.tenantId),
  ]
);

// ---- Channel Connections (OAuth/API credentials per tenant per channel) ----
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    channel: channelTypeEnum("channel").notNull(),
    status: channelConnectionStatusEnum("status").default("pending").notNull(),
    // Platform-specific identifiers
    platformAccountId: varchar("platform_account_id", { length: 256 }),  // WhatsApp phone ID, FB page ID, IG account ID
    platformPageId: varchar("platform_page_id", { length: 256 }),        // Facebook Page ID (shared by Messenger + IG)
    // Credentials (encrypted in production)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    webhookSecret: varchar("webhook_secret", { length: 256 }),
    // WhatsApp-specific
    wabaId: varchar("waba_id", { length: 128 }),                         // WhatsApp Business Account ID
    phoneNumber: varchar("phone_number", { length: 32 }),
    phoneNumberVerified: boolean("phone_number_verified").default(false).notNull(),
    // Channel-specific config
    greeting: text("greeting"),
    persistentMenu: json("persistent_menu").$type<{ label: string; action: string }[]>().default([]),
    iceBreakers: json("ice_breakers").$type<string[]>().default([]),
    // Meta
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_connections_tenant_id_idx").on(table.tenantId),
    index("channel_connections_platform_id_idx").on(table.platformAccountId),
  ]
);

// ---- Channel Contacts (cross-channel identity resolution) ----
export const channelContacts = pgTable(
  "channel_contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    // Canonical identity fields for matching
    email: varchar("email", { length: 256 }),
    phone: varchar("phone", { length: 64 }),
    name: varchar("name", { length: 256 }),
    // Per-channel external IDs
    widgetVisitorId: varchar("widget_visitor_id", { length: 128 }),
    whatsappId: varchar("whatsapp_id", { length: 64 }),           // WhatsApp phone number or wa_id
    messengerId: varchar("messenger_id", { length: 128 }),         // Page-scoped user ID (PSID)
    instagramId: varchar("instagram_id", { length: 128 }),         // IG-scoped user ID (IGSID)
    // Metadata
    avatarUrl: text("avatar_url"),
    language: varchar("language", { length: 10 }),
    lastChannel: channelTypeEnum("last_channel").default("widget").notNull(),
    totalConversations: integer("total_conversations").default(0).notNull(),
    totalMessages: integer("total_messages").default(0).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("channel_contacts_tenant_id_idx").on(table.tenantId),
    index("channel_contacts_email_idx").on(table.email),
    index("channel_contacts_phone_idx").on(table.phone),
    index("channel_contacts_whatsapp_id_idx").on(table.whatsappId),
    index("channel_contacts_messenger_id_idx").on(table.messengerId),
    index("channel_contacts_instagram_id_idx").on(table.instagramId),
    index("channel_contacts_widget_visitor_id_idx").on(table.widgetVisitorId),
  ]
);

// ---- WhatsApp Message Templates (for proactive outreach within 24h window) ----
export const waTemplates = pgTable(
  "wa_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").notNull().references(() => channelConnections.id, { onDelete: "cascade" }),
    templateName: varchar("template_name", { length: 256 }).notNull(),
    language: varchar("language", { length: 10 }).notNull().default("en"),
    category: varchar("category", { length: 64 }).notNull(),      // UTILITY, MARKETING, AUTHENTICATION
    status: varchar("status", { length: 32 }).default("PENDING").notNull(), // PENDING, APPROVED, REJECTED
    headerType: varchar("header_type", { length: 16 }),            // TEXT, IMAGE, DOCUMENT, VIDEO
    headerContent: text("header_content"),
    bodyText: text("body_text").notNull(),
    footerText: text("footer_text"),
    buttons: json("buttons").$type<{ type: string; text: string; url?: string; phoneNumber?: string }[]>().default([]),
    metaTemplateId: varchar("meta_template_id", { length: 128 }),  // returned by Meta after submission
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("wa_templates_connection_id_idx").on(table.connectionId),
  ]
);

// ---- Knowledge Versions (content history for rollback) ----
export const knowledgeVersions = pgTable(
  "knowledge_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeItemId: uuid("knowledge_item_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    chunkCount: integer("chunk_count").default(0).notNull(),
    // Snapshot of chunk IDs at this version (for Pinecone cleanup)
    chunkIds: uuid("chunk_ids").array().default([]),
    // What triggered this version
    source: varchar("source", { length: 32 }).notNull().default("manual"), // "manual" | "refresh" | "rollback"
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_versions_item_id_idx").on(table.knowledgeItemId),
  ]
);

// ---- Knowledge Change Log (detected changes pending approval) ----
export const knowledgeChangeLog = pgTable(
  "knowledge_change_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    knowledgeItemId: uuid("knowledge_item_id").notNull().references(() => knowledgeItems.id, { onDelete: "cascade" }),
    // Change details
    severity: changeSeverityEnum("severity").notNull(),
    approval: changeApprovalEnum("approval").default("pending").notNull(),
    // Content snapshots
    oldContentHash: varchar("old_content_hash", { length: 64 }),
    newContentHash: varchar("new_content_hash", { length: 64 }).notNull(),
    newContent: text("new_content").notNull(),
    newTitle: varchar("new_title", { length: 512 }),
    // Structured diff
    diffSummary: text("diff_summary"),                    // Human-readable summary
    sectionsAdded: integer("sections_added").default(0).notNull(),
    sectionsRemoved: integer("sections_removed").default(0).notNull(),
    sectionsModified: integer("sections_modified").default(0).notNull(),
    diffDetails: json("diff_details").$type<SectionDiff[]>().default([]),
    // Review
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_change_log_item_id_idx").on(table.knowledgeItemId),
    index("knowledge_change_log_approval_idx").on(table.approval),
    index("knowledge_change_log_tenant_id_idx").on(table.tenantId),
  ]
);

/** Structured section-level diff entry */
export interface SectionDiff {
  type: "added" | "removed" | "modified";
  heading: string | null;
  oldText: string | null;
  newText: string | null;
  /** Semantic similarity between old and new (0-1, for modified sections) */
  similarity: number | null;
}

// ---- Integrations (backend system connections) ----
export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").notNull().references(() => assistants.id, { onDelete: "cascade" }),
    provider: integrationProviderEnum("provider").notNull(),
    status: integrationStatusEnum("status").default("disconnected").notNull(),
    // Display
    label: varchar("label", { length: 256 }).notNull(),
    // OAuth credentials (encrypted in production)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    // Provider-specific config
    shopDomain: varchar("shop_domain", { length: 256 }),            // Shopify: mystore.myshopify.com
    apiKey: varchar("api_key", { length: 256 }),                     // Generic webhook or API key auth
    baseUrl: text("base_url"),                                       // Generic webhook base URL
    scopes: text("scopes"),                                          // OAuth scopes granted
    // Generic webhook config
    webhookConfig: json("webhook_config").$type<WebhookActionConfig[]>().default([]),
    // Connection metadata
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastError: text("last_error"),
    callCount: integer("call_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("integrations_tenant_id_idx").on(table.tenantId),
    index("integrations_assistant_id_idx").on(table.assistantId),
  ]
);

/** Config shape for generic webhook actions */
export interface WebhookActionConfig {
  actionName: string;
  description: string;
  method: "GET" | "POST";
  path: string;               // appended to baseUrl, e.g. "/api/orders/{{orderId}}"
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: string;       // JSON template with {{param}} placeholders
  responseMapping: Record<string, string>;  // { displayField: "jsonpath" }
  parameters: { name: string; type: string; description: string; required: boolean }[];
}

// ---- Integration Audit Log ----
export const integrationAuditLog = pgTable(
  "integration_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    integrationId: uuid("integration_id").notNull().references(() => integrations.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id"),
    // What was called
    actionName: varchar("action_name", { length: 128 }).notNull(),
    provider: integrationProviderEnum("provider").notNull(),
    // Request
    inputParams: json("input_params").$type<Record<string, string>>().default({}),
    // Response
    success: boolean("success").notNull(),
    responseStatus: integer("response_status"),
    responseFields: json("response_fields").$type<Record<string, unknown>>().default({}),  // sanitized
    errorMessage: text("error_message"),
    latencyMs: integer("latency_ms"),
    // PII handling
    piiDetected: boolean("pii_detected").default(false).notNull(),
    piiFieldsStripped: text("pii_fields_stripped").array().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("integration_audit_log_tenant_id_idx").on(table.tenantId),
    index("integration_audit_log_integration_id_idx").on(table.integrationId),
    index("integration_audit_log_conversation_id_idx").on(table.conversationId),
  ]
);

// ---- Analytics tables ----
export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    conversationCount: integer("conversation_count").default(0).notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    deflectedCount: integer("deflected_count").default(0).notNull(),
    escalatedCount: integer("escalated_count").default(0).notNull(),
    fallbackCount: integer("fallback_count").default(0).notNull(),
    avgConfidence: numeric("avg_confidence", { precision: 4, scale: 3 }),
    avgLatencyMs: integer("avg_latency_ms"),
    avgMessagesPerConv: numeric("avg_messages_per_conv", { precision: 6, scale: 2 }),
    tokensUsed: integer("tokens_used").default(0).notNull(),
    positiveFeedback: integer("positive_feedback").default(0).notNull(),
    negativeFeedback: integer("negative_feedback").default(0).notNull(),
    estimatedSavingsCents: integer("estimated_savings_cents").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("analytics_daily_tenant_date_idx").on(table.tenantId, table.date),
  ]
);

export const questionClusters = pgTable(
  "question_clusters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    assistantId: uuid("assistant_id").references(() => assistants.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }).notNull(),
    centroid: json("centroid").$type<number[]>().notNull(),
    questionCount: integer("question_count").default(0).notNull(),
    avgConfidence: numeric("avg_confidence", { precision: 4, scale: 3 }),
    suggestedQuestion: text("suggested_question"),
    suggestedAnswer: text("suggested_answer"),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    knowledgeItemId: uuid("knowledge_item_id").references(() => knowledgeItems.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("question_clusters_tenant_id_idx").on(table.tenantId),
    index("question_clusters_status_idx").on(table.status),
  ]
);

export const clusteredQuestions = pgTable(
  "clustered_questions",
  {
    clusterId: uuid("cluster_id").notNull().references(() => questionClusters.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    questionText: text("question_text").notNull(),
    similarity: numeric("similarity", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clusterId, table.messageId] }),
    index("clustered_questions_message_idx").on(table.messageId),
    index("clustered_questions_tenant_idx").on(table.tenantId),
  ]
);

// ---- Compliance tables ----
export const sarRequests = pgTable(
  "sar_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    // "export" — Art.15 access request. "delete" — Art.17 erasure request.
    type: varchar("type", { length: 16 }).notNull(),
    // Who the request is ABOUT. For end-customer requests, at least one of these must be set.
    // For tenant self-exports (controller self-SAR), both are null and type is "tenant_export".
    subjectEmail: varchar("subject_email", { length: 256 }),
    subjectIdentifier: varchar("subject_identifier", { length: 256 }), // e.g. sessionId, lead id
    status: varchar("status", { length: 16 }).default("pending").notNull(), // pending | in_progress | completed | failed
    requestedBy: uuid("requested_by"), // user id of the owner who filed it, null if customer-initiated
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultPath: text("result_path"), // storage path of the export bundle, if applicable
    errorMsg: text("error_msg"),
    notes: text("notes"),
  },
  (table) => [
    index("sar_requests_tenant_id_idx").on(table.tenantId),
    index("sar_requests_status_idx").on(table.status),
  ]
);

export const dataDeletionAudit = pgTable(
  "data_deletion_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    // "customer" — Art.17 erasure for a specific subject.
    // "tenant" — whole-tenant wipe on offboarding.
    // "retention" — automated retention-policy pruning.
    deletionType: varchar("deletion_type", { length: 16 }).notNull(),
    subjectEmail: varchar("subject_email", { length: 256 }),
    subjectIdentifier: varchar("subject_identifier", { length: 256 }),
    conversationsDeleted: integer("conversations_deleted").default(0).notNull(),
    messagesDeleted: integer("messages_deleted").default(0).notNull(),
    leadsDeleted: integer("leads_deleted").default(0).notNull(),
    securityEventsDeleted: integer("security_events_deleted").default(0).notNull(),
    chunksDeleted: integer("chunks_deleted").default(0).notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
    // null when performed by the retention cron job.
    performedBy: uuid("performed_by"),
    sarRequestId: uuid("sar_request_id").references(() => sarRequests.id, { onDelete: "set null" }),
  },
  (table) => [
    index("data_deletion_audit_tenant_id_idx").on(table.tenantId),
    index("data_deletion_audit_performed_at_idx").on(table.performedAt),
  ]
);

// ---- Relations ----
export const tenantsRelations = relations(tenants, ({ many }) => ({
  assistants: many(assistants),
  knowledgeItems: many(knowledgeItems),
  conversations: many(conversations),
  members: many(tenantMembers),
  securityEvents: many(securityEvents),
  usageLogs: many(usageLogs),
  escalationRules: many(escalationRules),
  escalationEvents: many(escalationEvents),
  agentAvailability: many(agentAvailability),
  businessHours: many(businessHours),
  engagementRules: many(engagementRules),
  leads: many(leads),
  leadEvents: many(leadEvents),
  channelConnections: many(channelConnections),
  channelContacts: many(channelContacts),
  integrations: many(integrations),
  integrationAuditLog: many(integrationAuditLog),
}));

export const assistantsRelations = relations(assistants, ({ one, many }) => ({
  tenant: one(tenants, { fields: [assistants.tenantId], references: [tenants.id] }),
  knowledgeItems: many(knowledgeItems),
  conversations: many(conversations),
  escalationRules: many(escalationRules),
  escalationEvents: many(escalationEvents),
  businessHours: many(businessHours),
  integrations: many(integrations),
  engagementRules: many(engagementRules),
  leads: many(leads),
  channelConnections: many(channelConnections),
}));

export const knowledgeItemsRelations = relations(knowledgeItems, ({ one, many }) => ({
  tenant: one(tenants, { fields: [knowledgeItems.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [knowledgeItems.assistantId], references: [assistants.id] }),
  chunks: many(chunks),
  versions: many(knowledgeVersions),
  changeLogs: many(knowledgeChangeLog),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  knowledgeItem: one(knowledgeItems, { fields: [chunks.knowledgeItemId], references: [knowledgeItems.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [conversations.assistantId], references: [assistants.id] }),
  messages: many(messages),
  escalationEvents: many(escalationEvents),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const escalationRulesRelations = relations(escalationRules, ({ one }) => ({
  tenant: one(tenants, { fields: [escalationRules.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [escalationRules.assistantId], references: [assistants.id] }),
}));

export const escalationEventsRelations = relations(escalationEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [escalationEvents.tenantId], references: [tenants.id] }),
  conversation: one(conversations, { fields: [escalationEvents.conversationId], references: [conversations.id] }),
  assistant: one(assistants, { fields: [escalationEvents.assistantId], references: [assistants.id] }),
}));

export const agentAvailabilityRelations = relations(agentAvailability, ({ one }) => ({
  tenant: one(tenants, { fields: [agentAvailability.tenantId], references: [tenants.id] }),
}));

export const businessHoursRelations = relations(businessHours, ({ one }) => ({
  tenant: one(tenants, { fields: [businessHours.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [businessHours.assistantId], references: [assistants.id] }),
}));

export const engagementRulesRelations = relations(engagementRules, ({ one }) => ({
  tenant: one(tenants, { fields: [engagementRules.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [engagementRules.assistantId], references: [assistants.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  tenant: one(tenants, { fields: [leads.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [leads.assistantId], references: [assistants.id] }),
  events: many(leadEvents),
}));

export const leadEventsRelations = relations(leadEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [leadEvents.tenantId], references: [tenants.id] }),
  lead: one(leads, { fields: [leadEvents.leadId], references: [leads.id] }),
}));

export const channelConnectionsRelations = relations(channelConnections, ({ one }) => ({
  tenant: one(tenants, { fields: [channelConnections.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [channelConnections.assistantId], references: [assistants.id] }),
}));

export const channelContactsRelations = relations(channelContacts, ({ one }) => ({
  tenant: one(tenants, { fields: [channelContacts.tenantId], references: [tenants.id] }),
}));

export const waTemplatesRelations = relations(waTemplates, ({ one }) => ({
  tenant: one(tenants, { fields: [waTemplates.tenantId], references: [tenants.id] }),
  connection: one(channelConnections, { fields: [waTemplates.connectionId], references: [channelConnections.id] }),
}));

export const integrationsRelations = relations(integrations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [integrations.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [integrations.assistantId], references: [assistants.id] }),
  auditLogs: many(integrationAuditLog),
}));

export const integrationAuditLogRelations = relations(integrationAuditLog, ({ one }) => ({
  tenant: one(tenants, { fields: [integrationAuditLog.tenantId], references: [tenants.id] }),
  integration: one(integrations, { fields: [integrationAuditLog.integrationId], references: [integrations.id] }),
}));

export const knowledgeVersionsRelations = relations(knowledgeVersions, ({ one }) => ({
  tenant: one(tenants, { fields: [knowledgeVersions.tenantId], references: [tenants.id] }),
  knowledgeItem: one(knowledgeItems, { fields: [knowledgeVersions.knowledgeItemId], references: [knowledgeItems.id] }),
}));

export const knowledgeChangeLogRelations = relations(knowledgeChangeLog, ({ one }) => ({
  tenant: one(tenants, { fields: [knowledgeChangeLog.tenantId], references: [tenants.id] }),
  knowledgeItem: one(knowledgeItems, { fields: [knowledgeChangeLog.knowledgeItemId], references: [knowledgeItems.id] }),
}));

export const analyticsDailyRelations = relations(analyticsDaily, ({ one }) => ({
  tenant: one(tenants, { fields: [analyticsDaily.tenantId], references: [tenants.id] }),
}));

export const questionClustersRelations = relations(questionClusters, ({ one, many }) => ({
  tenant: one(tenants, { fields: [questionClusters.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [questionClusters.assistantId], references: [assistants.id] }),
  knowledgeItem: one(knowledgeItems, { fields: [questionClusters.knowledgeItemId], references: [knowledgeItems.id] }),
  questions: many(clusteredQuestions),
}));

export const clusteredQuestionsRelations = relations(clusteredQuestions, ({ one }) => ({
  cluster: one(questionClusters, { fields: [clusteredQuestions.clusterId], references: [questionClusters.id] }),
  message: one(messages, { fields: [clusteredQuestions.messageId], references: [messages.id] }),
  tenant: one(tenants, { fields: [clusteredQuestions.tenantId], references: [tenants.id] }),
}));

export const sarRequestsRelations = relations(sarRequests, ({ one, many }) => ({
  tenant: one(tenants, { fields: [sarRequests.tenantId], references: [tenants.id] }),
  deletions: many(dataDeletionAudit),
}));

export const dataDeletionAuditRelations = relations(dataDeletionAudit, ({ one }) => ({
  tenant: one(tenants, { fields: [dataDeletionAudit.tenantId], references: [tenants.id] }),
  sarRequest: one(sarRequests, { fields: [dataDeletionAudit.sarRequestId], references: [sarRequests.id] }),
}));
