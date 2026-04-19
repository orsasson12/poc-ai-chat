// ---- Enums ----
export type PlanType = "starter" | "professional" | "business";
export type TenantStatus = "active" | "suspended" | "cancelled";
export type KnowledgeItemType = "document" | "url" | "manual_qa" | "structured";
export type KnowledgeItemStatus = "pending" | "processing" | "active" | "error" | "paused";
export type MessageRole = "user" | "assistant";
export type MemberRole = "owner" | "admin" | "manager" | "viewer";
export type SecurityEventType =
  | "prompt_injection"
  | "content_moderation"
  | "pii_detected"
  | "canary_leak"
  | "scope_violation";
export type SecuritySeverity = "low" | "medium" | "high" | "critical";
export type SatisfactionScore = -1 | 0 | 1;
export type WidgetPosition = "bottom-right" | "bottom-left";
export type LauncherAnimation = "none" | "pulse" | "bounce" | "attention_flash";
export const LAUNCHER_ANIMATIONS: readonly LauncherAnimation[] = [
  "none", "pulse", "bounce", "attention_flash",
] as const;
export type EscalationTrigger = "low_confidence" | "explicit_request" | "repeat_failure" | "safety" | "sentiment";
export type EscalationMode = "email" | "native" | "webhook";
export type EscalationStatus = "pending" | "assigned" | "active" | "resolved" | "expired";
export type MessageSender = "customer" | "bot" | "agent";
export type EngagementTrigger = "time_on_page" | "scroll_depth" | "exit_intent" | "return_visitor" | "url_pattern";
export type LeadIntent = "high" | "medium" | "low" | "unknown";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type ChannelType = "widget" | "whatsapp" | "messenger" | "instagram";
export type ChannelConnectionStatus = "pending" | "active" | "error" | "disconnected";
export type IntegrationProvider = "shopify" | "hubspot" | "zendesk" | "generic_webhook";
export type IntegrationStatus = "connected" | "disconnected" | "error" | "expired";
export type RefreshSchedule = "manual" | "daily" | "weekly" | "monthly";
export type ChangeSeverity = "none" | "minor" | "major";
export type ChangeApproval = "pending" | "approved" | "rejected" | "auto_approved";

// ---- Core Entities ----
export type DataRegion = "eu" | "us" | "auto";
export type AiDisclosureMode = "banner" | "inline" | "off";

export interface Tenant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  plan: PlanType;
  status: TenantStatus;
  stripeCustomerId: string | null;
  costPerTicketCents: number;
  dataRegion: DataRegion;
  retentionDaysConversations: number;
  retentionDaysLeads: number;
  retentionDaysSecurityEvents: number;
  aiDisclosureMode: AiDisclosureMode;
  aiDisclosureText: string | null;
  dpaAcceptedAt: Date | null;
  dpaAcceptedVersion: string | null;
  createdAt: Date;
}

export interface Assistant {
  id: string;
  tenantId: string;
  name: string;
  greeting: string;
  tone: string;
  fallbackMsg: string;
  escalationEmail: string | null;
  escalationWebhook: string | null;
  avatarUrl: string | null;
  widgetColor: string;
  widgetPosition: WidgetPosition;
  launcherAnimation: LauncherAnimation;
  launcherAccentColor: string | null;
  launcherAnimationIntervalSec: number;
  isActive: boolean;
  confidenceThreshold: number;
  welcomeBanner: string | null;
  welcomeButtons: WelcomeButton[];
  cookielessMode: boolean;
  createdAt: Date;
}

export interface KnowledgeItem {
  id: string;
  tenantId: string;
  assistantId: string;
  type: KnowledgeItemType;
  title: string;
  content: string | null;
  sourceUrl: string | null;
  filePath: string | null;
  fileSize: number | null;
  status: KnowledgeItemStatus;
  chunkCount: number;
  errorMsg: string | null;
  metadata: StructuredMetadata | null;
  featured: boolean;
  refreshSchedule: RefreshSchedule;
  lastRefreshedAt: Date | null;
  nextRefreshAt: Date | null;
  refreshStatus: string | null;
  lastRefreshError: string | null;
  contentHash: string | null;
  versionCount: number;
  pendingChangeId: string | null;
  createdAt: Date;
}

export interface Chunk {
  id: string;
  tenantId: string;
  knowledgeItemId: string;
  pineconeId: string;
  content: string;
  tokenCount: number;
  chunkIndex: number;
  heading: string | null;
}

export interface Conversation {
  id: string;
  tenantId: string;
  assistantId: string;
  sessionId: string;
  channel: ChannelType;
  contactId: string | null;
  channelConversationId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  messageCount: number;
  escalated: boolean;
  escalationStatus: EscalationStatus | null;
  assignedAgentId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  customerLanguage: string | null;
  customerDevice: string | null;
  referrerUrl: string | null;
  leadId: string | null;
  engagementRuleId: string | null;
  satisfaction: SatisfactionScore;
}

export interface Message {
  id: string;
  conversationId: string;
  tenantId: string;
  role: MessageRole;
  sender: MessageSender;
  agentId: string | null;
  content: string;
  chunksUsed: string[];
  confidence: number | null;
  latencyMs: number | null;
  tokensUsed: number | null;
  isFallback: boolean;
  feedback: "positive" | "negative" | null;
  createdAt: Date;
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  conversationId: string | null;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  inputText: string;
  classificationScore: number;
  blocked: boolean;
  createdAt: Date;
}

export interface TenantMember {
  id: string;
  tenantId: string;
  userId: string;
  role: MemberRole;
  invitedBy: string | null;
  acceptedAt: Date | null;
}

export interface UsageLog {
  id: string;
  tenantId: string;
  periodStart: Date;
  conversations: number;
  tokensIn: number;
  tokensOut: number;
}

// ---- Knowledge Freshness ----

export interface KnowledgeVersion {
  id: string;
  tenantId: string;
  knowledgeItemId: string;
  version: number;
  content: string;
  contentHash: string;
  title: string;
  chunkCount: number;
  chunkIds: string[];
  source: string;
  createdAt: Date;
}

export interface KnowledgeChangeEntry {
  id: string;
  tenantId: string;
  knowledgeItemId: string;
  severity: ChangeSeverity;
  approval: ChangeApproval;
  oldContentHash: string | null;
  newContentHash: string;
  newContent: string;
  newTitle: string | null;
  diffSummary: string | null;
  sectionsAdded: number;
  sectionsRemoved: number;
  sectionsModified: number;
  diffDetails: SectionDiff[];
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}

export interface SectionDiff {
  type: "added" | "removed" | "modified";
  heading: string | null;
  oldText: string | null;
  newText: string | null;
  similarity: number | null;
}

export interface FreshnessStatus {
  level: "fresh" | "aging" | "stale" | "unavailable";
  lastRefreshedAt: Date | null;
  nextRefreshAt: Date | null;
  daysSinceRefresh: number | null;
}

// ---- Escalation / Handoff ----

export interface EscalationRule {
  id: string;
  tenantId: string;
  assistantId: string;
  trigger: EscalationTrigger;
  enabled: boolean;
  confidenceThreshold: number;
  consecutiveCount: number;
  phrases: string[] | null;
  mode: EscalationMode;
  webhookUrl: string | null;
  webhookSecret: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EscalationEvent {
  id: string;
  tenantId: string;
  conversationId: string;
  assistantId: string;
  trigger: EscalationTrigger;
  mode: EscalationMode;
  status: EscalationStatus;
  assignedAgentId: string | null;
  summary: string | null;
  botDraftAnswer: string | null;
  knowledgeSourceIds: string[] | null;
  confidenceAtEscalation: number | null;
  customerEmail: string | null;
  customerName: string | null;
  webhookDeliveredAt: Date | null;
  webhookResponseStatus: number | null;
  webhookRetries: number;
  emailSentAt: Date | null;
  emailTo: string | null;
  createdAt: Date;
  assignedAt: Date | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export interface AgentAvailability {
  id: string;
  tenantId: string;
  userId: string;
  isOnline: boolean;
  maxConcurrent: number;
  activeCount: number;
  lastSeenAt: Date;
}

export interface DaySchedule {
  day: number;
  open: string | null;
  close: string | null;
}

export interface BusinessHours {
  id: string;
  tenantId: string;
  assistantId: string;
  timezone: string;
  schedule: DaySchedule[];
  outsideHoursMsg: string;
  createdAt: Date;
}

export interface EscalationContext {
  escalationId: string;
  trigger: EscalationTrigger;
  summary: string;
  transcript: {
    role: MessageRole;
    sender: MessageSender;
    content: string;
    confidence: number | null;
    createdAt: string;
  }[];
  knowledgeSources: { id: string; title: string; type: string }[];
  botDraftAnswer: string | null;
  customer: {
    email: string | null;
    name: string | null;
    language: string | null;
    device: string | null;
    referrerUrl: string | null;
  };
  confidenceAtEscalation: number | null;
  conversationId: string;
  assistantName: string;
  businessName: string;
  createdAt: string;
}

// ---- Lead Capture / Engagement ----

/** Rich call-to-action shown alongside a proactive engagement message. */
export interface MessageCta {
  label: string;
  url: string;
}

/** A single button rendered under a proactive engagement card. Max 3 per rule. */
export interface MessageButton {
  id: string;
  label: string;
  url: string;
  style?: "primary" | "secondary";
}

export interface EngagementRule {
  id: string;
  tenantId: string;
  assistantId: string;
  name: string;
  enabled: boolean;
  trigger: EngagementTrigger;
  delaySeconds: number;
  scrollPercent: number;
  urlPattern: string | null;
  proactiveMessage: string;
  qualifyingQuestions: string[];
  priority: number;
  // Frequency caps & cool-downs. 0 = unlimited for all three.
  maxPerSession: number;
  maxPerVisitor: number;
  cooldownSeconds: number;
  // Rich proactive message content.
  messageImage: string | null;
  messageCta: MessageCta | null;
  messageButtons: MessageButton[];
  // Stats
  impressions: number;
  engagements: number;
  leadsGenerated: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lead {
  id: string;
  tenantId: string;
  assistantId: string;
  visitorId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  intent: LeadIntent;
  status: LeadStatus;
  tags: string[];
  qualificationAnswers: Record<string, string>;
  sourceUrl: string | null;
  sourceTrigger: EngagementTrigger | null;
  engagementRuleId: string | null;
  language: string | null;
  device: string | null;
  referrer: string | null;
  totalPageViews: number;
  totalConversations: number;
  totalMessages: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface LeadEvent {
  id: string;
  tenantId: string;
  leadId: string;
  eventType: string;
  data: Record<string, string | number | boolean | null>;
  pageUrl: string | null;
  createdAt: Date;
}

/** Signals sent from the widget iframe to the engagement engine */
export interface WidgetBehaviorSignals {
  pageUrl: string;
  pageTitle: string;
  referrer: string;
  timeOnPageSeconds: number;
  scrollDepthPercent: number;
  isExitIntent: boolean;
  isReturnVisitor: boolean;
  visitorId: string;
  device: "desktop" | "mobile" | "tablet";
  language: string;
}

// ---- Backend Integrations ----

export interface Integration {
  id: string;
  tenantId: string;
  assistantId: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  label: string;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  shopDomain: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  scopes: string | null;
  webhookConfig: WebhookActionConfig[];
  connectedAt: Date | null;
  lastUsedAt: Date | null;
  lastError: string | null;
  callCount: number;
  createdAt: Date;
}

export interface WebhookActionConfig {
  actionName: string;
  description: string;
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: string;
  responseMapping: Record<string, string>;
  parameters: { name: string; type: string; description: string; required: boolean }[];
}

export interface IntegrationAuditEntry {
  id: string;
  tenantId: string;
  integrationId: string;
  conversationId: string | null;
  actionName: string;
  provider: IntegrationProvider;
  inputParams: Record<string, string>;
  success: boolean;
  responseStatus: number | null;
  responseFields: Record<string, unknown>;
  errorMessage: string | null;
  latencyMs: number | null;
  piiDetected: boolean;
  piiFieldsStripped: string[];
  createdAt: Date;
}

/** Describes a single action a plugin exposes for LLM tool-use */
export interface IntegrationActionDef {
  name: string;
  description: string;
  provider: IntegrationProvider;
  parameters: {
    name: string;
    type: "string" | "number" | "boolean";
    description: string;
    required: boolean;
  }[];
}

/** Result returned by a plugin action after execution */
export interface IntegrationActionResult {
  success: boolean;
  data: Record<string, unknown>;
  error?: string | null;
  /** Fields that were stripped by PII detection */
  strippedFields: string[];
}

// ---- Multi-Channel ----

export interface ChannelConnection {
  id: string;
  tenantId: string;
  assistantId: string;
  channel: ChannelType;
  status: ChannelConnectionStatus;
  platformAccountId: string | null;
  platformPageId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  webhookSecret: string | null;
  wabaId: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  greeting: string | null;
  persistentMenu: { label: string; action: string }[];
  iceBreakers: string[];
  connectedAt: Date | null;
  lastWebhookAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface ChannelContact {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  widgetVisitorId: string | null;
  whatsappId: string | null;
  messengerId: string | null;
  instagramId: string | null;
  avatarUrl: string | null;
  language: string | null;
  lastChannel: ChannelType;
  totalConversations: number;
  totalMessages: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface WaTemplate {
  id: string;
  tenantId: string;
  connectionId: string;
  templateName: string;
  language: string;
  category: string;
  status: string;
  headerType: string | null;
  headerContent: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: { type: string; text: string; url?: string; phoneNumber?: string }[];
  metaTemplateId: string | null;
  createdAt: Date;
}

/**
 * Normalized inbound message from any channel.
 * Every channel adapter converts platform-specific payloads into this format.
 */
export interface InboundMessage {
  /** Unique message ID from the originating platform */
  platformMessageId: string;
  /** Which channel this came from */
  channel: ChannelType;
  /** Tenant-scoped contact identifier on the platform (e.g., WA phone, PSID) */
  platformSenderId: string;
  /** Text content (may be empty for media-only messages) */
  text: string;
  /** Media attachments */
  media: {
    type: "image" | "video" | "audio" | "document" | "sticker";
    url: string;
    mimeType?: string;
    caption?: string;
  }[];
  /** Quick reply payload if the user tapped a button */
  quickReplyPayload: string | null;
  /** Platform-specific raw payload for auditing */
  rawPayload: unknown;
  /** Timestamp from the platform */
  timestamp: Date;
  /** Resolved tenant + assistant context */
  tenantId: string;
  assistantId: string;
  connectionId: string;
}

/**
 * Normalized outbound message that adapters format for each platform.
 */
export interface OutboundMessage {
  text: string;
  /** Rich cards to render (adapters translate per channel) */
  cards: CardData[];
  /** Quick reply buttons */
  quickReplies: { title: string; payload: string }[];
  /** Media attachment */
  media: {
    type: "image" | "video" | "document";
    url: string;
    caption?: string;
  } | null;
  /** Source citations */
  sources: { title: string; url: string }[];
}

// ---- Structured Content ----
export interface StructuredMetadata {
  imageUrl?: string | null;
  cardType: string;
  fields: Record<string, string | number | boolean | null>;
}

export interface CardData {
  knowledgeItemId: string;
  title: string;
  imageUrl: string | null;
  cardType: string;
  fields: Record<string, string | number | boolean | null>;
  sourceUrl: string | null;
}

export interface WelcomeButton {
  id: string;
  label: string;
  url: string;
}

// ---- API Types ----
export interface ChatRequest {
  assistantId: string;
  message: string;
  sessionId: string;
  history?: { role: MessageRole; content: string }[];
}

export interface WidgetConfig {
  name: string;
  greeting: string;
  avatarUrl: string | null;
  widgetColor: string;
  widgetPosition: WidgetPosition;
  launcherAnimation: LauncherAnimation;
  launcherAccentColor: string | null;
  launcherAnimationIntervalSec: number;
  isActive: boolean;
  suggestedQuestions?: string[];
  featuredCards?: CardData[];
  welcomeBanner?: string | null;
  welcomeButtons?: WelcomeButton[];
}

export interface SafetyResult {
  passed: boolean;
  blocked: boolean;
  eventType?: SecurityEventType;
  severity?: SecuritySeverity;
  score?: number;
  cleanedMessage?: string;
}

// ---- Dashboard Types ----
export interface DashboardMetrics {
  conversationsToday: number;
  conversationsWeek: number;
  conversationsMonth: number;
  resolutionRate: number;
  csatScore: number;
  unansweredCount: number;
  healthScore: number;
}

export interface CustomerStats {
  avgLatencyMs: number;
  totalMessages: number;
  positiveFeedback: number;
  negativeFeedback: number;
  totalTokensUsed: number;
  avgMessagesPerConversation: number;
  escalatedCount: number;
  totalConversations: number;
  confidenceHigh: number;
  confidenceMedium: number;
  confidenceLow: number;
  satisfactionPositive: number;
  satisfactionNeutral: number;
  satisfactionNegative: number;
  topKnowledgeItems: { id: string; title: string; usageCount: number }[];
}

export interface TopQuestion {
  question: string;
  count: number;
}

export interface ConversationVolume {
  date: string;
  count: number;
}
