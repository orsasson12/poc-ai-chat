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
} from "drizzle-orm/pg-core";
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

// ---- Tables ----
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  plan: planEnum("plan").default("starter").notNull(),
  status: tenantStatusEnum("status").default("active").notNull(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 256 }),
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
    widgetColor: varchar("widget_color", { length: 7 }).notNull().default("#2563eb"),
    widgetPosition: widgetPositionEnum("widget_position").default("bottom-right").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    confidenceThreshold: numeric("confidence_threshold", { precision: 3, scale: 2 })
      .default("0.65")
      .notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("knowledge_items_tenant_id_idx").on(table.tenantId),
    index("knowledge_items_assistant_id_idx").on(table.assistantId),
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
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    messageCount: integer("message_count").default(0).notNull(),
    escalated: boolean("escalated").default(false).notNull(),
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

// ---- Relations ----
export const tenantsRelations = relations(tenants, ({ many }) => ({
  assistants: many(assistants),
  knowledgeItems: many(knowledgeItems),
  conversations: many(conversations),
  members: many(tenantMembers),
  securityEvents: many(securityEvents),
  usageLogs: many(usageLogs),
}));

export const assistantsRelations = relations(assistants, ({ one, many }) => ({
  tenant: one(tenants, { fields: [assistants.tenantId], references: [tenants.id] }),
  knowledgeItems: many(knowledgeItems),
  conversations: many(conversations),
}));

export const knowledgeItemsRelations = relations(knowledgeItems, ({ one, many }) => ({
  tenant: one(tenants, { fields: [knowledgeItems.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [knowledgeItems.assistantId], references: [assistants.id] }),
  chunks: many(chunks),
}));

export const chunksRelations = relations(chunks, ({ one }) => ({
  knowledgeItem: one(knowledgeItems, { fields: [chunks.knowledgeItemId], references: [knowledgeItems.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  tenant: one(tenants, { fields: [conversations.tenantId], references: [tenants.id] }),
  assistant: one(assistants, { fields: [conversations.assistantId], references: [assistants.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));
